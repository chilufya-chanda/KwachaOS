import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const mission = await prisma.mission.findFirst({ where: { id: params.id, business: { workspace: { members: { some: { userId: user.id } } } } } });
    if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 });
    if (mission.status !== "active") return NextResponse.json({ error: "Only active missions can be paused." }, { status: 400 });
    await prisma.$transaction([prisma.mission.update({ where: { id: mission.id }, data: { status: "paused" } }), prisma.activityLog.create({ data: { missionId: mission.id, actor: "user", message: "Mission paused by workspace owner." } })]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to pause mission." }, { status: 500 });
  }
}
