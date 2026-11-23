import { prisma } from "@/lib/database/prisma";
import { getAgentDefinition, AgentKey } from "@/lib/agents/registry";
import { simulateCampaign, getMissionAnalytics, simulateMarketTick, simulatePaperTrade, getMarketData } from "@/lib/simulation/engine";
import { decryptToken } from "@/lib/integrations/crypto";
import { tavilySearch, TavilyConfigurationError, TavilySearchError } from "@/lib/research/tavily";

export type ToolContext = { missionId: string; agentKey: AgentKey; args?: Record<string, unknown> };
export type ToolResult = { tool: string; ok: boolean; message: string; data?: Record<string, unknown> };
type Handler = (ctx: ToolContext) => Promise<ToolResult>;

const safeText = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value.trim() : fallback);
const safeNumber = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

async function getWorkspaceIdForMission(missionId: string): Promise<string | null> {
  const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { business: { select: { workspaceId: true } } } });
  return mission?.business.workspaceId ?? null;
}

/** Looks up a connected, decrypted integration for this mission's workspace. Never throws — callers report the honest status instead. */
async function getConnectedIntegration(missionId: string, provider: string) {
  const workspaceId = await getWorkspaceIdForMission(missionId);
  if (!workspaceId) return { connected: false as const, reason: "Workspace not found." };
  const row = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId, provider } } });
  if (!row || row.status !== "connected" || !row.accessTokenEnc) {
    return { connected: false as const, reason: `${provider} is not connected for this workspace yet.` };
  }
  try {
    const accessToken = decryptToken(row.accessTokenEnc);
    return { connected: true as const, accessToken, externalAccountId: row.externalAccountId, workspaceId };
  } catch {
    return { connected: false as const, reason: `Stored ${provider} credentials could not be decrypted (check INTEGRATIONS_ENCRYPTION_KEY).` };
  }
}

/** Real WhatsApp send, shared by the agent's sendWhatsAppMessage tool and the human "intervene" API route - one real code path, not two. */
export async function sendWhatsAppReal(missionId: string, to: string, body: string): Promise<ToolResult> {
  const integration = await getConnectedIntegration(missionId, "whatsapp");
  if (!integration.connected) {
    await prisma.communicationMessage.create({ data: { missionId, channel: "whatsapp", direction: "outbound", contactRef: to, body, status: "not_connected" } });
    return { tool: "sendWhatsAppMessage", ok: false, message: integration.reason };
  }
  if (!integration.externalAccountId) {
    await prisma.communicationMessage.create({ data: { missionId, channel: "whatsapp", direction: "outbound", contactRef: to, body, status: "not_connected" } });
    return { tool: "sendWhatsAppMessage", ok: false, message: "WhatsApp is connected but no phone number ID is on file yet — set it in Integrations." };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${integration.externalAccountId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${integration.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `WhatsApp send failed (${res.status}).`);
    await prisma.communicationMessage.create({ data: { missionId, channel: "whatsapp", direction: "outbound", contactRef: to, body, status: "sent", externalMessageId: data?.messages?.[0]?.id } });
    return { tool: "sendWhatsAppMessage", ok: true, message: "WhatsApp message sent.", data: { externalMessageId: data?.messages?.[0]?.id } };
  } catch (e: any) {
    await prisma.communicationMessage.create({ data: { missionId, channel: "whatsapp", direction: "outbound", contactRef: to, body, status: "failed" } });
    return { tool: "sendWhatsAppMessage", ok: false, message: e.message || "WhatsApp send failed." };
  }
}

/** Real publish dispatcher, shared by the agent's publishTo* tools and the human "publish this draft" API route. */
export async function publishToPlatformReal(missionId: string, platform: string, content: string): Promise<ToolResult> {
  if (!content) return { tool: `publishTo${platform[0].toUpperCase()}${platform.slice(1)}`, ok: false, message: "content is required." };

  if (platform === "instagram" || platform === "tiktok" || platform === "youtube") {
    await prisma.socialPost.create({ data: { missionId, platform, content, status: "not_connected" } });
    const mediaWord = platform === "instagram" ? "an image or video" : "a video";
    return { tool: `publishTo${platform[0].toUpperCase()}${platform.slice(1)}`, ok: false, message: `${platform} publishing requires ${mediaWord} attachment, which Kwacha OS doesn't generate or upload yet — not supported in this build.` };
  }

  if (platform === "facebook") {
    const integration = await getConnectedIntegration(missionId, "facebook");
    if (!integration.connected) {
      await prisma.socialPost.create({ data: { missionId, platform, content, status: "not_connected" } });
      return { tool: "publishToFacebook", ok: false, message: integration.reason };
    }
    if (!integration.externalAccountId) {
      await prisma.socialPost.create({ data: { missionId, platform, content, status: "not_connected" } });
      return { tool: "publishToFacebook", ok: false, message: "Facebook is connected, but no Page is on file yet to post as." };
    }
    try {
      // NOTE: reliable Page posting normally needs a Page access token
      // (exchanged from the user token via /me/accounts), not the raw user
      // token stored at connect time. This may return an auth error until
      // that exchange is added — that's an honest current limitation, not
      // a silent failure: the error will say so.
      const res = await fetch(`https://graph.facebook.com/v21.0/${integration.externalAccountId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, access_token: integration.accessToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Facebook publish failed (${res.status}).`);
      await prisma.socialPost.create({ data: { missionId, platform, content, status: "published", externalPostId: data.id } });
      return { tool: "publishToFacebook", ok: true, message: "Published to Facebook.", data: { externalPostId: data.id } };
    } catch (e: any) {
      await prisma.socialPost.create({ data: { missionId, platform, content, status: "failed" } });
      return { tool: "publishToFacebook", ok: false, message: e.message || "Facebook publish failed." };
    }
  }

  if (platform === "linkedin") {
    const integration = await getConnectedIntegration(missionId, "linkedin");
    if (!integration.connected) {
      await prisma.socialPost.create({ data: { missionId, platform, content, status: "not_connected" } });
      return { tool: "publishToLinkedIn", ok: false, message: integration.reason };
    }
    try {
      const meRes = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${integration.accessToken}` } });
      const me = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !me.sub) throw new Error("Could not resolve LinkedIn member ID.");
      const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: { Authorization: `Bearer ${integration.accessToken}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
        body: JSON.stringify({
          author: `urn:li:person:${me.sub}`,
          lifecycleState: "PUBLISHED",
          specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: content }, shareMediaCategory: "NONE" } },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `LinkedIn publish failed (${res.status}).`);
      await prisma.socialPost.create({ data: { missionId, platform, content, status: "published", externalPostId: res.headers.get("x-restli-id") || undefined } });
      return { tool: "publishToLinkedIn", ok: true, message: "Published to LinkedIn." };
    } catch (e: any) {
      await prisma.socialPost.create({ data: { missionId, platform, content, status: "failed" } });
      return { tool: "publishToLinkedIn", ok: false, message: e.message || "LinkedIn publish failed." };
    }
  }

  return { tool: "publish", ok: false, message: `Unknown platform: ${platform}.` };
}

const handlers: Record<string, Handler> = {
  // --- Research: real live web search via Tavily. This is a real network
  // call (Tavily API usage, not Gemini tokens — see Token Management #34)
  // and we hand back only compact extracts, not full pages, keeping the
  // next Gemini turn cheap. The model still authors the actual finding
  // itself (via searchMarket/analyzeCompetitors/identifyAudience below),
  // now grounded in real current results instead of training knowledge alone.
  webSearch: async ({ missionId, args }) => {
    const query = safeText(args?.query, "");
    if (!query) return { tool: "webSearch", ok: false, message: "A query argument is required." };
    try {
      const { answer, results } = await tavilySearch(query);
      await prisma.memory.create({
        data: { missionId, key: `research.websearch.${Date.now()}`, value: JSON.stringify({ query, answer, results }) },
      });
      return {
        tool: "webSearch",
        ok: true,
        message: `Found ${results.length} real web result(s) for "${query}".`,
        data: { answer, results: results as any },
      };
    } catch (e) {
      const message = e instanceof TavilyConfigurationError || e instanceof TavilySearchError ? e.message : "Web search failed.";
      return { tool: "webSearch", ok: false, message };
    }
  },

  // --- Research: the model authors the real finding as an argument (this
  // reuses tokens already spent on the agent's own reasoning turn — no
  // extra Gemini call), and we persist exactly what it found for THIS
  // mission, replacing the old hardcoded "Lusaka property developers" text
  // that was returned for every mission regardless of what it was about. ---
  searchMarket: async ({ missionId, args }) => {
    const finding = safeText(args?.finding, "");
    if (!finding) return { tool: "searchMarket", ok: false, message: "A finding argument is required — describe what you found." };
    await prisma.memory.create({ data: { missionId, key: `research.market.${Date.now()}`, value: finding } });
    return { tool: "searchMarket", ok: true, message: "Market research recorded.", data: { finding } };
  },
  analyzeCompetitors: async ({ missionId, args }) => {
    const finding = safeText(args?.finding, "");
    if (!finding) return { tool: "analyzeCompetitors", ok: false, message: "A finding argument is required." };
    await prisma.memory.create({ data: { missionId, key: `research.competitors.${Date.now()}`, value: finding } });
    return { tool: "analyzeCompetitors", ok: true, message: "Competitor analysis recorded.", data: { finding } };
  },
  identifyAudience: async ({ missionId, args }) => {
    const segments = safeText(args?.segments, "");
    if (!segments) return { tool: "identifyAudience", ok: false, message: "A segments argument is required." };
    await prisma.memory.create({ data: { missionId, key: `research.audience.${Date.now()}`, value: segments } });
    return { tool: "identifyAudience", ok: true, message: "Audience segments recorded.", data: { segments } };
  },
  summarizeResearch: async ({ missionId, args }) => {
    const summary = safeText(args?.summary, "");
    if (!summary) return { tool: "summarizeResearch", ok: false, message: "A summary argument is required." };
    await prisma.activityLog.create({ data: { missionId, actor: "research", message: summary } });
    return { tool: "summarizeResearch", ok: true, message: "Research summary recorded." };
  },

  createCampaign: async ({ missionId, args }) => {
    const name = safeText(args?.name, `Kwacha Campaign ${new Date().toLocaleDateString()}`);
    const campaign = await prisma.campaign.create({ data: { missionId, name, status: "active" } });
    return { tool: "createCampaign", ok: true, message: `Created simulated campaign ${campaign.name}.`, data: { campaignId: campaign.id, name: campaign.name } };
  },
  simulateCampaign: async ({ missionId, args }) => {
    const result = await simulateCampaign(missionId, { campaignId: safeText(args?.campaignId, "") || undefined, spend: typeof args?.spend === "number" ? args.spend : undefined });
    return { tool: "simulateCampaign", ok: true, message: `Simulation generated ${result.qualifiedLeads ?? 0} qualified leads.`, data: result as any };
  },
  getCampaignMetrics: async ({ missionId }) => {
    const campaigns = await prisma.campaign.findMany({ where: { missionId }, select: { id: true, name: true, spend: true, status: true } });
    return { tool: "getCampaignMetrics", ok: true, message: "Campaign state retrieved.", data: { campaigns } };
  },
  pauseCampaign: async ({ missionId, args }) => {
    const campaignId = safeText(args?.campaignId, "");
    if (!campaignId) return { tool: "pauseCampaign", ok: false, message: "campaignId is required." };
    const c = await prisma.campaign.findFirst({ where: { id: campaignId, missionId } });
    if (!c) return { tool: "pauseCampaign", ok: false, message: "Campaign not found for this mission." };
    await prisma.campaign.update({ where: { id: c.id }, data: { status: "paused" } });
    return { tool: "pauseCampaign", ok: true, message: `Paused ${c.name}.` };
  },
  adjustCampaign: async ({ missionId, args }) => {
    const note = safeText(args?.note, "");
    if (!note) return { tool: "adjustCampaign", ok: false, message: "A note argument describing the adjustment is required." };
    await prisma.activityLog.create({ data: { missionId, actor: "marketing", message: note } });
    return { tool: "adjustCampaign", ok: true, message: "Campaign adjustment recorded." };
  },

  // --- Sales / CRM: real Lead CRUD with real arguments. ---
  getLeads: async ({ missionId }) => {
    const leads = await prisma.lead.findMany({ where: { missionId }, take: 25, orderBy: { createdAt: "desc" } });
    return { tool: "getLeads", ok: true, message: `Retrieved ${leads.length} mission leads.`, data: { leads } };
  },
  createLead: async ({ missionId, args }) => {
    const name = safeText(args?.name, "");
    if (!name) return { tool: "createLead", ok: false, message: "name is required." };
    const lead = await prisma.lead.create({
      data: {
        missionId,
        name,
        contact: safeText(args?.contact, "") || null,
        interest: safeText(args?.interest, "") || null,
        budget: typeof args?.budget === "number" ? args.budget : null,
        qualification: safeText(args?.qualification, "unqualified"),
      },
    });
    return { tool: "createLead", ok: true, message: `Created lead ${lead.name}.`, data: { leadId: lead.id } };
  },
  qualifyLead: async ({ missionId, args }) => {
    const leadId = safeText(args?.leadId, "");
    if (!leadId) return { tool: "qualifyLead", ok: false, message: "leadId is required." };
    const qualification = safeText(args?.qualification, "");
    if (!["low", "medium", "high"].includes(qualification)) return { tool: "qualifyLead", ok: false, message: "qualification must be low, medium, or high." };
    const lead = await prisma.lead.findFirst({ where: { id: leadId, missionId } });
    if (!lead) return { tool: "qualifyLead", ok: false, message: "Lead not found for this mission." };
    await prisma.lead.update({ where: { id: lead.id }, data: { qualification, status: "qualified" } });
    return { tool: "qualifyLead", ok: true, message: `Lead qualified as ${qualification}.` };
  },
  updateLeadRecord: async ({ missionId, args }) => {
    const leadId = safeText(args?.leadId, "");
    const status = safeText(args?.status, "");
    if (!leadId || !status) return { tool: "updateLeadRecord", ok: false, message: "leadId and status are required." };
    if (!["new", "qualified", "contacted", "won", "lost"].includes(status)) return { tool: "updateLeadRecord", ok: false, message: "Invalid status." };
    const lead = await prisma.lead.findFirst({ where: { id: leadId, missionId } });
    if (!lead) return { tool: "updateLeadRecord", ok: false, message: "Lead not found for this mission." };
    await prisma.lead.update({ where: { id: lead.id }, data: { status } });
    return { tool: "updateLeadRecord", ok: true, message: `Lead status updated to ${status}.` };
  },
  updateLead: async ({ missionId, args }) => {
    const note = safeText(args?.note, "");
    if (!note) return { tool: "updateLead", ok: false, message: "A note describing the workflow update is required." };
    await prisma.activityLog.create({ data: { missionId, actor: "sales", message: note } });
    return { tool: "updateLead", ok: true, message: "Lead workflow update recorded." };
  },
  prepareFollowUp: async ({ missionId, args }) => {
    const plan = safeText(args?.plan, "");
    if (!plan) return { tool: "prepareFollowUp", ok: false, message: "A plan argument is required." };
    await prisma.activityLog.create({ data: { missionId, actor: "sales", message: `Follow-up prepared (not sent — no messaging channel invoked): ${plan}` } });
    return { tool: "prepareFollowUp", ok: true, message: "Follow-up plan recorded." };
  },
  scheduleMeeting: async ({ missionId, args }) => {
    const details = safeText(args?.details, "");
    if (!details) return { tool: "scheduleMeeting", ok: false, message: "A details argument is required." };
    await prisma.activityLog.create({ data: { missionId, actor: "sales", message: `Meeting scheduling is simulation-only; no external calendar invite was created. Details: ${details}` } });
    return { tool: "scheduleMeeting", ok: true, message: "Simulated meeting scheduling recorded." };
  },

  // --- Analytics ---
  analyzeCampaign: async ({ missionId }) => {
    const analytics = await getMissionAnalytics(missionId);
    await prisma.memory.create({ data: { missionId, key: `analytics.campaign.${Date.now()}`, value: JSON.stringify(analytics) } });
    return { tool: "analyzeCampaign", ok: true, message: "Campaign performance analyzed from simulation state.", data: analytics as any };
  },
  calculateMetrics: async ({ missionId }) => {
    const a = await getMissionAnalytics(missionId);
    return { tool: "calculateMetrics", ok: true, message: "Current mission metrics calculated.", data: a as any };
  },
  compareCampaigns: async ({ missionId }) => {
    const campaigns = await prisma.campaign.findMany({ where: { missionId }, select: { name: true, spend: true } });
    return { tool: "compareCampaigns", ok: true, message: "Campaign comparison prepared.", data: { campaigns } };
  },
  detectAnomaly: async ({ missionId, args }) => {
    const finding = safeText(args?.finding, "No anomaly detected in current data.");
    await prisma.activityLog.create({ data: { missionId, actor: "analytics", message: finding } });
    return { tool: "detectAnomaly", ok: true, message: "Anomaly check recorded.", data: { finding } };
  },
  generateReport: async ({ missionId, args }) => {
    const a = await getMissionAnalytics(missionId);
    const summary = safeText(args?.summary, "");
    await prisma.memory.create({ data: { missionId, key: `analytics.report.${Date.now()}`, value: JSON.stringify({ ...a, summary }) } });
    return { tool: "generateReport", ok: true, message: "Analytics report stored.", data: { ...a, summary } as any };
  },
  getBudget: async ({ missionId }) => {
    const m = await prisma.mission.findUnique({ where: { id: missionId }, include: { campaigns: true } });
    if (!m) return { tool: "getBudget", ok: false, message: "Mission not found." };
    const spent = m.campaigns.reduce((n, c) => n + c.spend, 0);
    return { tool: "getBudget", ok: true, message: "Simulation budget retrieved.", data: { authorized: m.budgetAmount, spent, remaining: Math.max(0, m.budgetAmount - spent), currency: m.currency } };
  },
  recordSimulatedSpend: async ({ args }) => {
    const amount = safeNumber(args?.amount, 0);
    if (amount <= 0) return { tool: "recordSimulatedSpend", ok: false, message: "A positive simulated amount is required." };
    await prisma.ledgerTransaction.create({ data: { type: "debit", amount, reason: "Manual simulation ledger event", isSimulated: true } });
    return { tool: "recordSimulatedSpend", ok: true, message: "Simulated spend recorded." };
  },
  getRemainingBudget: async ({ missionId }) => {
    const m = await prisma.mission.findUnique({ where: { id: missionId }, include: { campaigns: true } });
    if (!m) return { tool: "getRemainingBudget", ok: false, message: "Mission not found." };
    const spent = m.campaigns.reduce((n, c) => n + c.spend, 0);
    return { tool: "getRemainingBudget", ok: true, message: "Remaining simulation budget calculated.", data: { remaining: Math.max(0, m.budgetAmount - spent), spent } };
  },
  recordAttributedRevenue: async ({ missionId, args }) => {
    const amount = safeNumber(args?.amount, 0);
    if (amount <= 0) return { tool: "recordAttributedRevenue", ok: false, message: "A positive simulated revenue amount is required." };
    await prisma.ledgerTransaction.create({ data: { type: "credit", amount, reason: `Simulated revenue for mission ${missionId}`, isSimulated: true } });
    return { tool: "recordAttributedRevenue", ok: true, message: "Simulated revenue attributed." };
  },

  // --- Markets (paper trading — never real) ---
  getMarketData: async () => {
    const data = await getMarketData();
    return { tool: "getMarketData", ok: true, message: "Synthetic market data retrieved.", data: { instruments: data } as any };
  },
  analyzeMarket: async () => {
    const data = await getMarketData();
    return { tool: "analyzeMarket", ok: true, message: "Synthetic market analysis prepared.", data: { instruments: data, mode: "paper trading" } as any };
  },
  calculateRisk: async ({ args }) => {
    const quantity = safeNumber(args?.quantity, 1);
    const price = safeNumber(args?.price, 100);
    return { tool: "calculateRisk", ok: true, message: "Paper-trading risk estimate calculated.", data: { notional: quantity * price, estimatedRisk: quantity * price * 0.08 } };
  },
  simulateTrade: async ({ args }) => {
    const instrumentId = safeText(args?.instrumentId, "");
    const quantity = safeNumber(args?.quantity, 0);
    if (!instrumentId || quantity <= 0) return { tool: "simulateTrade", ok: false, message: "instrumentId and positive quantity are required." };
    const result = await simulatePaperTrade(instrumentId, quantity);
    return { tool: "simulateTrade", ok: true, message: "Paper trade simulated; no live order was placed.", data: result as any };
  },
  closePaperPosition: async ({ args }) => {
    const id = safeText(args?.positionId, "");
    if (!id) return { tool: "closePaperPosition", ok: false, message: "positionId is required." };
    const p = await prisma.paperPosition.findUnique({ where: { id } });
    if (!p) return { tool: "closePaperPosition", ok: false, message: "Paper position not found." };
    await prisma.paperPosition.update({ where: { id }, data: { status: "closed" } });
    return { tool: "closePaperPosition", ok: true, message: "Paper position closed." };
  },
  tickMarkets: async () => {
    const data = await simulateMarketTick();
    return { tool: "tickMarkets", ok: true, message: "Synthetic market prices updated.", data: { instruments: data } as any };
  },

  // --- Business Knowledge (Stage 12) — retrieved on demand rather than
  // stuffed into every prompt, per the Token Management principle of only
  // sending compact, relevant data to Gemini when it's actually needed. ---
  getBusinessKnowledge: async ({ missionId, args }) => {
    const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { businessId: true } });
    if (!mission) return { tool: "getBusinessKnowledge", ok: false, message: "Mission not found." };
    const category = safeText(args?.category, "");
    const items = await prisma.businessKnowledge.findMany({
      where: { businessId: mission.businessId, status: "approved", ...(category ? { category } : {}) },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { category: true, title: true, content: true },
    });
    return { tool: "getBusinessKnowledge", ok: true, message: `Found ${items.length} approved knowledge item(s).`, data: { items } };
  },

  // --- Content Agent: the model writes real copy as an argument (no extra
  // Gemini call — this reuses the same turn it's already in), we persist it
  // for real. Publishing it is the Social Publishing Agent's separate job. ---
  draftContent: async ({ missionId, args }) => {
    const body = safeText(args?.body, "");
    const platform = safeText(args?.platform, "generic");
    const kind = safeText(args?.kind, "post");
    if (!body) return { tool: "draftContent", ok: false, message: "A body argument with the actual drafted text is required." };
    const draft = await prisma.contentDraft.create({ data: { missionId, platform, kind, body } });
    return { tool: "draftContent", ok: true, message: `Draft saved for ${platform}.`, data: { draftId: draft.id } };
  },
  getContentDrafts: async ({ missionId }) => {
    const drafts = await prisma.contentDraft.findMany({ where: { missionId }, orderBy: { createdAt: "desc" }, take: 10 });
    return { tool: "getContentDrafts", ok: true, message: `Retrieved ${drafts.length} drafts.`, data: { drafts } };
  },

  // --- Communication Agent: real WhatsApp send when connected; an honest,
  // logged "not connected" result otherwise — never a fabricated message. ---
  draftMessage: async ({ missionId, args }) => {
    const body = safeText(args?.body, "");
    if (!body) return { tool: "draftMessage", ok: false, message: "A body argument is required." };
    await prisma.memory.create({ data: { missionId, key: `communication.draft.${Date.now()}`, value: body } });
    return { tool: "draftMessage", ok: true, message: "Message drafted and saved for review.", data: { body } };
  },
  sendWhatsAppMessage: async ({ missionId, args }) => {
    const to = safeText(args?.to, "");
    const body = safeText(args?.body, "");
    if (!to || !body) return { tool: "sendWhatsAppMessage", ok: false, message: "to and body are required." };
    return sendWhatsAppReal(missionId, to, body);
  },
  getCommunicationHistory: async ({ missionId }) => {
    const messages = await prisma.communicationMessage.findMany({ where: { missionId }, orderBy: { createdAt: "desc" }, take: 20 });
    return { tool: "getCommunicationHistory", ok: true, message: `Retrieved ${messages.length} messages.`, data: { messages } };
  },

  // --- Social Publishing Agent: real API calls when connected, honest
  // "not connected" / "not supported yet" otherwise. Never fakes success. ---
  publishToFacebook: async ({ missionId, args }) => publishToPlatformReal(missionId, "facebook", safeText(args?.content, "")),
  publishToLinkedIn: async ({ missionId, args }) => publishToPlatformReal(missionId, "linkedin", safeText(args?.content, "")),
  publishToInstagram: async ({ missionId, args }) => publishToPlatformReal(missionId, "instagram", safeText(args?.content, "")),
  publishToTikTok: async ({ missionId, args }) => publishToPlatformReal(missionId, "tiktok", safeText(args?.content, "")),
  publishToYoutube: async ({ missionId, args }) => publishToPlatformReal(missionId, "youtube", safeText(args?.content, "")),
};

export function getTool(key: string) {
  return handlers[key];
}
export function isToolAllowed(agentKey: AgentKey, toolKey: string) {
  return Boolean(getAgentDefinition(agentKey)?.allowedTools.includes(toolKey));
}

export async function executeTool(agentKey: AgentKey, toolKey: string, ctx: Omit<ToolContext, "agentKey">): Promise<ToolResult> {
  if (!isToolAllowed(agentKey, toolKey)) throw new Error(`Permission denied: ${agentKey} cannot execute ${toolKey}.`);
  const handler = getTool(toolKey);
  if (!handler) throw new Error(`Unknown tool: ${toolKey}.`);
  return handler({ ...ctx, agentKey });
}
