import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { getWalletSummary } from "@/lib/wallet/ledger";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (!member) return NextResponse.json({ error: "No workspace found for this account." }, { status: 404 });

    const summary = await getWalletSummary(member.workspaceId);
    const recent = await prisma.walletTransaction.findMany({
      where: { workspaceId: member.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ ...summary, recentTransactions: recent });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to load wallet." }, { status: 500 });
  }
}
