import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { heartbeatMission } from "@/lib/heartbeat/service";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const mission = await prisma.mission.findFirst({ where: { id: params.id, business: { workspace: { members: { some: { userId: user.id } } } } }, select: { id: true } });
    if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 });
    const result = await heartbeatMission(mission.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    const message = e instanceof Error ? e.message : "Heartbeat cycle failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
