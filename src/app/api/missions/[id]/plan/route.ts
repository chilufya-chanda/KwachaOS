import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { createMissionPlan, InsufficientBalanceError } from "@/lib/ai/mission-planner";
import { GeminiConfigurationError, GeminiRequestError } from "@/lib/ai/gemini";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const mission = await prisma.mission.findFirst({ where: { id: params.id, business: { workspace: { members: { some: { userId: user.id } } } } } });
    if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 });
    if (mission.status === "completed" || mission.status === "expired") return NextResponse.json({ error: "This mission can no longer be planned." }, { status: 400 });
    const plan = await createMissionPlan(mission.id);
    return NextResponse.json({ ok: true, model: process.env.GEMINI_MODEL || "gemini-2.5-flash", plan });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof InsufficientBalanceError) return NextResponse.json({ error: e.message, code: "INSUFFICIENT_WALLET_BALANCE" }, { status: 402 });
    if (e instanceof GeminiConfigurationError) return NextResponse.json({ error: e.message, code: "GEMINI_NOT_CONFIGURED" }, { status: 503 });
    if (e instanceof GeminiRequestError) return NextResponse.json({ error: e.message, code: "GEMINI_UNAVAILABLE" }, { status: 502 });
    return NextResponse.json({ error: "Unable to generate the mission plan." }, { status: 500 });
  }
}
