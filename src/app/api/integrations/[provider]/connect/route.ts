import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { OAUTH_PROVIDERS, isOAuthConfigured } from "@/lib/integrations/providers";
import { signOAuthState } from "@/lib/integrations/state";
import { encryptionConfigured } from "@/lib/integrations/crypto";

export async function POST(req: NextRequest, { params }: { params: { provider: string } }) {
  try {
    const user = await requireUser(req);
    const provider = OAUTH_PROVIDERS[params.provider];
    if (!provider) {
      return NextResponse.json({ error: `"${params.provider}" is not a connectable platform.` }, { status: 404 });
    }
    if (!isOAuthConfigured(provider)) {
      return NextResponse.json(
        { error: `${provider.label} isn't configured yet. Set ${provider.clientIdEnv} and ${provider.clientSecretEnv} in your environment first.` },
        { status: 400 }
      );
    }
    if (!encryptionConfigured()) {
      return NextResponse.json(
        { error: "INTEGRATIONS_ENCRYPTION_KEY isn't set — tokens can't be stored securely until it is." },
        { status: 400 }
      );
    }
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: "APP_URL isn't set — required to build the OAuth redirect URL." }, { status: 400 });
    }

    const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (!member) return NextResponse.json({ error: "No workspace found for this account." }, { status: 404 });

    const state = signOAuthState(member.workspaceId, user.id, provider.key);
    const redirectUri = `${appUrl}/api/integrations/${provider.key}/callback`;
    const authUrl = provider.authorizeUrl({
      clientId: process.env[provider.clientIdEnv] as string,
      redirectUri,
      state,
      scopes: provider.scopes,
    });

    await prisma.integrationAuditLog.create({
      data: { workspaceId: member.workspaceId, provider: provider.key, action: "connect_initiated" },
    });

    return NextResponse.json({ authUrl });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to start the connection." }, { status: 500 });
  }
}
