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

/** User Flow Stage 13 — each agent's configurable fields. */
const AGENT_SETTING_SCHEMAS: Record<string, z.ZodTypeAny> = {
  research: z.object({
    researchTopics: z.string().max(1000).optional(),
    approvedSources: z.string().max(1000).optional(),
    researchFrequency: z.enum(["daily", "weekly", "monthly", "on_demand"]).optional(),
    reportFormat: z.enum(["brief", "detailed"]).optional(),
  }),
  content: z.object({
    contentTypes: z.string().max(500).optional(),
    postingFrequency: z.enum(["daily", "weekly", "monthly", "on_demand"]).optional(),
    platforms: z.string().max(500).optional(),
    approvalRequired: z.boolean().optional(),
  }),
  communication: z.object({
    channels: z.string().max(300).optional(),
    responseStyle: z.string().max(500).optional(),
    businessHours: z.string().max(200).optional(),
    escalationRules: z.string().max(1000).optional(),
    humanHandoff: z.boolean().optional(),
  }),
  marketing: z.object({
    marketingGoals: z.string().max(1000).optional(),
    targetAudience: z.string().max(1000).optional(),
    campaignBudgetLimits: z.number().nonnegative().optional(),
    approvalRules: z.string().max(1000).optional(),
  }),
  crm: z.object({
    leadStages: z.string().max(500).optional(),
    assignmentRules: z.string().max(1000).optional(),
    requiredFields: z.string().max(500).optional(),
    followUpRules: z.string().max(1000).optional(),
  }),
  analytics: z.object({
    metrics: z.string().max(500).optional(),
    reportFrequency: z.enum(["daily", "weekly", "monthly"]).optional(),
    recipients: z.string().max(500).optional(),
    alertThresholds: z.string().max(500).optional(),
  }),
};

export async function GET(req: NextRequest, { params }: { params: { agentKey: string } }) {
  try {
    const workspaceId = await getWorkspaceId(req);
    if (!AGENT_SETTING_SCHEMAS[params.agentKey]) return NextResponse.json({ error: "Unknown or unconfigurable agent." }, { status: 404 });
    const row = await prisma.agentSetting.findUnique({ where: { workspaceId_agentKey: { workspaceId, agentKey: params.agentKey } } });
    return NextResponse.json({ settings: row ? JSON.parse(row.settingsJson) : {} });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e.message || "Unable to load agent settings." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { agentKey: string } }) {
  try {
    const workspaceId = await getWorkspaceId(req);
    const validator = AGENT_SETTING_SCHEMAS[params.agentKey];
    if (!validator) return NextResponse.json({ error: "Unknown or unconfigurable agent." }, { status: 404 });
    const body = validator.parse(await req.json());
    const row = await prisma.agentSetting.upsert({
      where: { workspaceId_agentKey: { workspaceId, agentKey: params.agentKey } },
      create: { workspaceId, agentKey: params.agentKey, settingsJson: JSON.stringify(body) },
      update: { settingsJson: JSON.stringify(body) },
    });
    return NextResponse.json({ settings: JSON.parse(row.settingsJson) });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid agent settings." }, { status: 400 });
    return NextResponse.json({ error: e.message || "Unable to update agent settings." }, { status: 500 });
  }
}
