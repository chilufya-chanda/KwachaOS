import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { MISSION_STAGES } from "@/lib/missions/stages";

const schema = z.object({
  businessId: z.string().min(1), objective: z.string().min(5).max(500),
  targetAudience: z.string().max(500).optional(), budgetAmount: z.number().nonnegative().max(1000000),
  currency: z.string().length(3).default("ZMW"), deadlineDays: z.number().int().min(1).max(365),
  successMetric: z.string().min(2).max(300),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    if (!membership) return NextResponse.json({ missions: [] });
    const businessId = req.nextUrl.searchParams.get("businessId");
    const missions = await prisma.mission.findMany({
      where: { businessId: businessId ?? undefined, business: { workspaceId: membership.workspaceId } },
      include: { stages: { orderBy: { order: "asc" } }, _count: { select: { leads: true, runs: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ missions });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to load missions." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = schema.parse(await req.json());
    const business = await prisma.business.findFirst({
      where: { id: body.businessId, workspace: { members: { some: { userId: user.id } } } },
      include: { workspace: { include: { subscription: true } } },
    });
    if (!business) return NextResponse.json({ error: "Business not found." }, { status: 404 });
    if (business.workspace.subscription?.status !== "demo_active") return NextResponse.json({ error: "Activate the demo subscription first." }, { status: 403 });
    if (business.availableBudget != null && body.budgetAmount > business.availableBudget) return NextResponse.json({ error: "Mission budget exceeds the business budget." }, { status: 400 });

    const mission = await prisma.mission.create({
      data: {
        businessId: business.id, objective: body.objective, targetAudience: body.targetAudience,
        budgetAmount: body.budgetAmount, currency: body.currency,
        deadline: new Date(Date.now() + body.deadlineDays * 86400000), successMetric: body.successMetric,
        status: "draft", currentStage: MISSION_STAGES[0].key,
        stages: { create: MISSION_STAGES.map((s, i) => ({ name: s.name, order: i, status: "pending" })) },
        activity: { create: { actor: "system", message: "Mission created and waiting to start." } },
      }, include: { stages: { orderBy: { order: "asc" } } },
    });
    return NextResponse.json({ mission }, { status: 201 });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Check the mission fields and try again." }, { status: 400 });
    return NextResponse.json({ error: "Unable to create mission." }, { status: 500 });
  }
}
