import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const mission = await prisma.mission.findFirst({
      where: { id: params.id, business: { workspace: { members: { some: { userId: user.id } } } } },
      include: { business: true, stages: { orderBy: { order: "asc" } }, agents: { include: { agent: true }, orderBy: { createdAt: "asc" } }, activity: { orderBy: { createdAt: "desc" }, take: 40 }, memories: { orderBy: { createdAt: "desc" }, take: 20 }, runs: { include: { agent: true }, orderBy: { createdAt: "desc" }, take: 20 }, heartbeatRuns: { orderBy: { createdAt: "desc" }, take: 10 }, leads: { orderBy: { createdAt: "desc" }, take: 10 }, _count: { select: { leads: true, runs: true } } },
    });
    if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 });
    return NextResponse.json({ mission });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to load mission." }, { status: 500 });
  }
}
