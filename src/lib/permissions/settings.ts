import { prisma } from "@/lib/database/prisma";

/**
 * User Flow Stage 14 — Permission Center. Every tool falls into one of
 * three buckets by default. A workspace can override individual tools via
 * PermissionSetting; absence of an override means the default here applies.
 *
 * "Always human-controlled" (refunds, financial transfers, deleting data,
 * legal decisions, sensitive account changes) isn't a mode at all in this
 * list — none of those are things any tool in this build can do, so there
 * is nothing to gate; this is enforced by simply never building such a
 * tool, which is a stronger guarantee than a settings flag would be.
 */
export type PermissionMode = "auto" | "approval" | "blocked";

const DEFAULT_MODES: Record<string, PermissionMode> = {
  // Can do automatically — research, analysis, drafting, organizing, reporting
  webSearch: "auto",
  searchMarket: "auto",
  analyzeCompetitors: "auto",
  identifyAudience: "auto",
  summarizeResearch: "auto",
  draftContent: "auto",
  getContentDrafts: "auto",
  getLeads: "auto",
  createLead: "auto",
  qualifyLead: "auto",
  updateLeadRecord: "auto",
  updateLead: "auto",
  prepareFollowUp: "auto",
  scheduleMeeting: "auto",
  analyzeCampaign: "auto",
  calculateMetrics: "auto",
  compareCampaigns: "auto",
  detectAnomaly: "auto",
  generateReport: "auto",
  getBudget: "auto",
  getRemainingBudget: "auto",
  recordSimulatedSpend: "auto",
  recordAttributedRevenue: "auto",
  getMarketData: "auto",
  analyzeMarket: "auto",
  calculateRisk: "auto",
  simulateTrade: "auto", // paper trading only, never real money
  closePaperPosition: "auto",
  tickMarkets: "auto",
  draftMessage: "auto",
  getCommunicationHistory: "auto",
  pauseCampaign: "auto", // pausing is the safe direction

  // Needs approval — publishing, customer messaging, launching/changing spend
  createCampaign: "approval",
  simulateCampaign: "approval", // this is what actually spends simulated budget
  adjustCampaign: "approval",
  sendWhatsAppMessage: "approval", // Communication Policy below can relax this per-category
  publishToFacebook: "approval",
  publishToInstagram: "approval",
  publishToTikTok: "approval",
  publishToLinkedIn: "approval",
  publishToYoutube: "approval",
};

export async function getPermissionOverride(workspaceId: string, toolKey: string): Promise<PermissionMode | null> {
  const row = await prisma.permissionSetting.findUnique({ where: { workspaceId_toolKey: { workspaceId, toolKey } } });
  return (row?.mode as PermissionMode) || null;
}

/**
 * Resolves the real permission mode for one tool call. `args` lets
 * Spend Controls and Communication Safety make a context-aware decision
 * (e.g. a WhatsApp reply to a "simple" question vs. a "complex/refund"
 * one) rather than a single static mode per tool.
 */
export async function resolvePermissionMode(workspaceId: string, toolKey: string, args?: Record<string, unknown>): Promise<{ mode: PermissionMode; reason?: string }> {
  const override = await getPermissionOverride(workspaceId, toolKey);

  if (toolKey === "sendWhatsAppMessage") {
    return resolveCommunicationMode(workspaceId, args, override);
  }
  if (toolKey === "createCampaign" || toolKey === "simulateCampaign") {
    return resolveSpendMode(workspaceId, toolKey, args, override);
  }

  return { mode: override || DEFAULT_MODES[toolKey] || "approval" }; // unknown tools fail safe to approval, not auto
}

async function resolveCommunicationMode(workspaceId: string, args: Record<string, unknown> | undefined, override: PermissionMode | null): Promise<{ mode: PermissionMode; reason?: string }> {
  if (override) return { mode: override };
  const policy = await prisma.communicationPolicy.findUnique({ where: { workspaceId } });
  const mode = policy?.mode || "auto_simple_and_qualify";
  const category = String(args?.category || "simple");
  const isSensitive = category === "complex_or_refund_or_legal";

  if (mode === "draft_only") return { mode: "approval", reason: "Communication Safety is set to draft-only." };
  if (isSensitive) return { mode: "approval", reason: "Complex, refund, or legal messages always need human review." };
  if (mode === "auto_simple" && category !== "simple") return { mode: "approval", reason: "Only simple questions are automatic under the current Communication Safety setting." };
  return { mode: "auto" };
}

async function resolveSpendMode(workspaceId: string, toolKey: string, args: Record<string, unknown> | undefined, override: PermissionMode | null): Promise<{ mode: PermissionMode; reason?: string }> {
  const controls = await prisma.spendControl.findUnique({ where: { workspaceId } });
  const spend = typeof args?.spend === "number" ? args.spend : 0;

  if (controls) {
    if (spend > controls.maxCampaignSpend) return { mode: "blocked", reason: `Requested spend $${spend} exceeds the maximum campaign spend of $${controls.maxCampaignSpend}.` };
    const todaySpend = await getTodaySpend(workspaceId);
    if (todaySpend + spend > controls.maxDailySpend) return { mode: "blocked", reason: `This would exceed today's maximum advertising spend of $${controls.maxDailySpend}.` };
  }

  if (override) return { mode: override };
  if (toolKey === "createCampaign" && (controls?.requireApprovalNewCampaign ?? true)) return { mode: "approval", reason: "New campaigns require approval." };
  if (toolKey === "simulateCampaign" && spend > 0 && !(controls?.allowAutoOptimizationWithinBudget ?? true)) return { mode: "approval", reason: "Spend changes require approval." };
  return { mode: DEFAULT_MODES[toolKey] || "approval" };
}

/**
 * Approximates today's simulated ad spend for a workspace by summing
 * Campaign.spend for campaigns created today. This is a real query, but an
 * approximation, not an itemized ledger: Campaign.spend is a running total
 * rather than per-day transactions, so a campaign created yesterday that
 * spends more today isn't captured here. Precise per-day attribution would
 * need a dedicated spend-event log, which is more infrastructure than this
 * simulated-economy feature currently warrants — documented in the README.
 */
async function getTodaySpend(workspaceId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const campaigns = await prisma.campaign.findMany({
    where: { createdAt: { gte: startOfDay }, mission: { business: { workspaceId } } },
    select: { spend: true },
  });
  return campaigns.reduce((sum, c) => sum + c.spend, 0);
}
