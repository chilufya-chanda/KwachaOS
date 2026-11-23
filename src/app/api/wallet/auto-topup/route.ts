import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { getOrCreateWallet } from "@/lib/wallet/ledger";

const schema = z.object({
  autoTopUpEnabled: z.boolean().optional(),
  autoTopUpThreshold: z.number().min(1).max(500).optional(),
  autoTopUpAmount: z.number().min(5).max(1000).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = schema.parse(await req.json());
    const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (!member) return NextResponse.json({ error: "No workspace found for this account." }, { status: 404 });

    await getOrCreateWallet(member.workspaceId);
    const wallet = await prisma.wallet.update({ where: { workspaceId: member.workspaceId }, data: body });

    return NextResponse.json({ wallet });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Please check the settings." }, { status: 400 });
    return NextResponse.json({ error: "Unable to update auto top-up settings." }, { status: 500 });
  }
}
