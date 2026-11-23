import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { OAUTH_PROVIDERS, MANUAL_PROVIDERS, isOAuthConfigured } from "@/lib/integrations/providers";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (!member) return NextResponse.json({ error: "No workspace found for this account." }, { status: 404 });

    const rows = await prisma.integration.findMany({ where: { workspaceId: member.workspaceId } });
    const byProvider = new Map(rows.map((r) => [r.provider, r]));

    const oauth = Object.values(OAUTH_PROVIDERS).map((p) => {
      const row = byProvider.get(p.key);
      return {
        key: p.key,
        label: p.label,
        kind: "oauth" as const,
        configured: isOAuthConfigured(p),
        status: row?.status ?? "disconnected",
        externalAccountName: row?.externalAccountName ?? null,
        connectedAt: row?.connectedAt ?? null,
        hasContext: Boolean(row?.contextBusinessName),
      };
    });

    const manual = MANUAL_PROVIDERS.map((p) => {
      const row = byProvider.get(p.key);
      return {
        key: p.key,
        label: p.label,
        kind: "manual" as const,
        note: p.note,
        status: row?.status ?? "disconnected",
      };
    });

    return NextResponse.json({ integrations: [...oauth, ...manual] });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to load integrations." }, { status: 500 });
  }
}
