import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { OAUTH_PROVIDERS } from "@/lib/integrations/providers";
import { StateError, verifyOAuthState } from "@/lib/integrations/state";
import { encryptToken } from "@/lib/integrations/crypto";

function redirectToApp(req: NextRequest, query: Record<string, string>) {
  const base = process.env.APP_URL || req.nextUrl.origin;
  const url = new URL("/workspace/integrations", base);
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const provider = OAUTH_PROVIDERS[params.provider];
  if (!provider) {
    return redirectToApp(req, { error: "unknown_provider" });
  }

  const code = req.nextUrl.searchParams.get("code");
  const stateToken = req.nextUrl.searchParams.get("state");
  const providerError = req.nextUrl.searchParams.get("error_description") || req.nextUrl.searchParams.get("error");

  if (providerError) {
    return redirectToApp(req, { provider: provider.key, error: providerError });
  }
  if (!code || !stateToken) {
    return redirectToApp(req, { provider: provider.key, error: "missing_code_or_state" });
  }

  let statePayload;
  try {
    statePayload = verifyOAuthState(stateToken, provider.key);
  } catch (e: any) {
    const msg = e instanceof StateError ? e.message : "Invalid OAuth state.";
    return redirectToApp(req, { provider: provider.key, error: msg });
  }

  const { workspaceId } = statePayload;
  const appUrl = process.env.APP_URL as string;
  const redirectUri = `${appUrl}/api/integrations/${provider.key}/callback`;

  try {
    const clientId = process.env[provider.clientIdEnv] as string;
    const clientSecret = process.env[provider.clientSecretEnv] as string;
    const tokenResult = await provider.exchangeCode({ clientId, clientSecret, redirectUri, code });

    let accountInfo: { externalAccountId: string; externalAccountName: string } | null = null;
    if (provider.fetchAccountInfo) {
      try {
        accountInfo = await provider.fetchAccountInfo(tokenResult.accessToken);
      } catch {
        // Non-fatal — the connection is still valid even if we can't label it yet.
      }
    }

    await prisma.integration.upsert({
      where: { workspaceId_provider: { workspaceId, provider: provider.key } },
      create: {
        workspaceId,
        provider: provider.key,
        status: "connected",
        scopes: provider.scopes.join(","),
        accessTokenEnc: encryptToken(tokenResult.accessToken),
        refreshTokenEnc: tokenResult.refreshToken ? encryptToken(tokenResult.refreshToken) : null,
        tokenExpiresAt: tokenResult.expiresInSeconds ? new Date(Date.now() + tokenResult.expiresInSeconds * 1000) : null,
        connectedAt: new Date(),
        externalAccountId: accountInfo?.externalAccountId,
        externalAccountName: accountInfo?.externalAccountName,
      },
      update: {
        status: "connected",
        scopes: provider.scopes.join(","),
        accessTokenEnc: encryptToken(tokenResult.accessToken),
        refreshTokenEnc: tokenResult.refreshToken ? encryptToken(tokenResult.refreshToken) : null,
        tokenExpiresAt: tokenResult.expiresInSeconds ? new Date(Date.now() + tokenResult.expiresInSeconds * 1000) : null,
        connectedAt: new Date(),
        lastError: null,
        externalAccountId: accountInfo?.externalAccountId,
        externalAccountName: accountInfo?.externalAccountName,
      },
    });

    await prisma.integrationAuditLog.create({
      data: { workspaceId, provider: provider.key, action: "connect_success", detail: accountInfo?.externalAccountName },
    });

    return redirectToApp(req, { connected: provider.key });
  } catch (e: any) {
    await prisma.integration.upsert({
      where: { workspaceId_provider: { workspaceId, provider: provider.key } },
      create: { workspaceId, provider: provider.key, status: "error", lastError: e.message || "Connection failed." },
      update: { status: "error", lastError: e.message || "Connection failed." },
    });
    await prisma.integrationAuditLog.create({
      data: { workspaceId, provider: provider.key, action: "connect_error", detail: e.message },
    });
    return redirectToApp(req, { provider: provider.key, error: e.message || "connection_failed" });
  }
}
