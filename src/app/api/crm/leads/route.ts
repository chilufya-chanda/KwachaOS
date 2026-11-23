import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (!member) return NextResponse.json({ error: "No workspace found for this account." }, { status: 404 });

    const leads = await prisma.lead.findMany({
      where: { mission: { business: { workspaceId: member.workspaceId } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { mission: { select: { id: true, objective: true } } },
    });
    return NextResponse.json({ leads });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to load leads." }, { status: 500 });
  }
}
