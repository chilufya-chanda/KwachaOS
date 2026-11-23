import { prisma } from "@/lib/database/prisma";

export async function recordDecision(input: {
  missionId: string;
  actor: string;
  trigger: string;
  summary: string;
  evidence?: unknown;
  action: string;
  outcome?: string;
}) {
  return prisma.decision.create({
    data: {
      missionId: input.missionId,
      actor: input.actor,
      trigger: input.trigger,
      summary: input.summary,
      evidence: input.evidence === undefined ? undefined : JSON.stringify(input.evidence),
      action: input.action,
      outcome: input.outcome,
    },
  });
}

export async function createApprovalIfNeeded(input: {
  missionId: string;
  title: string;
  description: string;
}) {
  const existing = await prisma.approval.findFirst({
    where: { missionId: input.missionId, title: input.title, status: "pending" },
  });
  if (existing) return existing;
  return prisma.approval.create({ data: input });
}
