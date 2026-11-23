import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { AGENT_REGISTRY } from "@/lib/agents/registry";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const rows = await prisma.agent.findMany({ include: { tasks: { where: { mission: { business: { workspace: { members: { some: { userId: user.id } } } } } }, orderBy: { createdAt: "desc" }, take: 5 }, runs: { where: { mission: { business: { workspace: { members: { some: { userId: user.id } } } } } }, orderBy: { createdAt: "desc" }, take: 5 } } });
    const agents = Object.values(AGENT_REGISTRY).map((definition) => { const row = rows.find((r) => r.key === definition.key); return { ...definition, id: row?.id ?? null, status: row?.status ?? "idle", recentTasks: row?.tasks ?? [], recentRuns: row?.runs ?? [] }; });
    return NextResponse.json({ agents });
  } catch (e: any) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status }); return NextResponse.json({ error: "Unable to load agent registry." }, { status: 500 }); }
}
