import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { ALL_PROVIDER_KEYS } from "@/lib/integrations/providers";

export async function DELETE(req: NextRequest, { params }: { params: { provider: string } }) {
  try {
    const user = await requireUser(req);
    if (!ALL_PROVIDER_KEYS.includes(params.provider)) {
      return NextResponse.json({ error: `"${params.provider}" is not a recognized platform.` }, { status: 404 });
    }
    const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (!member) return NextResponse.json({ error: "No workspace found for this account." }, { status: 404 });

    const existing = await prisma.integration.findUnique({
      where: { workspaceId_provider: { workspaceId: member.workspaceId, provider: params.provider } },
    });
    if (!existing) return NextResponse.json({ ok: true }); // already disconnected

    await prisma.integration.update({
      where: { workspaceId_provider: { workspaceId: member.workspaceId, provider: params.provider } },
      data: {
        status: "disconnected",
        accessTokenEnc: null,
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        connectedAt: null,
        lastError: null,
      },
    });

    await prisma.integrationAuditLog.create({
      data: { workspaceId: member.workspaceId, provider: params.provider, action: "disconnect" },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to disconnect." }, { status: 500 });
  }
}
