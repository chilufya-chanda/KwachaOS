import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

async function getWorkspaceId(req: NextRequest) {
  const user = await requireUser(req);
  const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!member) throw new Error("No workspace found for this account.");
  return member.workspaceId;
}

export async function GET(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId(req);
    const controls = await prisma.spendControl.upsert({ where: { workspaceId }, update: {}, create: { workspaceId } });
    return NextResponse.json({ controls });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e.message || "Unable to load spend controls." }, { status: 500 });
  }
}

const schema = z.object({
  maxDailySpend: z.number().positive().max(100000).optional(),
  maxCampaignSpend: z.number().positive().max(1000000).optional(),
  requireApprovalNewCampaign: z.boolean().optional(),
  requireApprovalBudgetIncrease: z.boolean().optional(),
  requireApprovalNewAudience: z.boolean().optional(),
  requireApprovalCampaignRestart: z.boolean().optional(),
  allowAutoOptimizationWithinBudget: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId(req);
    const body = schema.parse(await req.json());
    const controls = await prisma.spendControl.upsert({ where: { workspaceId }, create: { workspaceId, ...body }, update: body });
    return NextResponse.json({ controls });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid spend control settings." }, { status: 400 });
    return NextResponse.json({ error: e.message || "Unable to update spend controls." }, { status: 500 });
  }
}
