export type AgentKey = "research" | "marketing" | "sales" | "analytics" | "markets" | "crm" | "communication" | "social" | "content";
export type AgentDefinition = { key: AgentKey; name: string; description: string; capabilities: string[]; allowedTools: string[]; forbiddenActions: string[] };

export const AGENT_REGISTRY: Record<AgentKey, AgentDefinition> = {
  research: {
    key: "research",
    name: "Research Agent",
    description: "Market, audience and competitor research grounded in real, live web search results plus this specific business's real context.",
    capabilities: ["live web search", "market research", "audience discovery", "competitor analysis"],
    allowedTools: ["webSearch", "getBusinessKnowledge", "searchMarket", "analyzeCompetitors", "identifyAudience", "summarizeResearch"],
    forbiddenActions: ["real outreach", "real spending", "account changes"],
  },
  marketing: {
    key: "marketing",
    name: "Marketing Agent",
    description: "Campaign planning and simulated acquisition operations.",
    capabilities: ["campaign creation", "campaign analysis", "content planning"],
    allowedTools: ["createCampaign", "simulateCampaign", "getCampaignMetrics", "pauseCampaign", "adjustCampaign"],
    forbiddenActions: ["real advertising spend", "real customer messaging", "financial transactions"],
  },
  sales: {
    key: "sales",
    name: "Sales Agent",
    description: "Lead qualification and simulated sales workflows.",
    capabilities: ["lead review", "qualification", "follow-up preparation"],
    allowedTools: ["getLeads", "qualifyLead", "prepareFollowUp", "updateLead", "scheduleMeeting"],
    forbiddenActions: ["unsolicited real messages", "real meetings", "unrelated customer data"],
  },
  analytics: {
    key: "analytics",
    name: "Analytics Agent",
    description: "Performance measurement and decision support.",
    capabilities: ["campaign analysis", "metrics", "anomaly detection", "reporting"],
    allowedTools: ["analyzeCampaign", "calculateMetrics", "compareCampaigns", "detectAnomaly", "generateReport", "getBudget", "getRemainingBudget"],
    forbiddenActions: ["changing permissions", "financial transactions", "external actions"],
  },
  markets: {
    key: "markets",
    name: "Markets Agent",
    description: "Synthetic market intelligence and paper-trading simulation.",
    capabilities: ["market data", "risk analysis", "signal generation", "paper positions"],
    allowedTools: ["getMarketData", "analyzeMarket", "calculateRisk", "simulateTrade", "closePaperPosition", "tickMarkets"],
    forbiddenActions: ["live trading", "real financial transactions", "investment guarantees"],
  },
  crm: {
    key: "crm",
    name: "CRM Agent",
    description: "Manages this workspace's real lead and customer records — every read and write here is real data, not simulated.",
    capabilities: ["lead lifecycle management", "customer record updates", "pipeline organization"],
    allowedTools: ["getLeads", "getBusinessKnowledge", "createLead", "updateLeadRecord", "qualifyLead"],
    forbiddenActions: ["contacting leads directly (that is the Communication Agent's job)", "deleting customer history", "external CRM sync until a CRM is connected"],
  },
  communication: {
    key: "communication",
    name: "Communication Agent",
    description: "Drafts and, only when a real WhatsApp Business account is connected, sends customer messages. Never fabricates a sent message.",
    capabilities: ["message drafting", "WhatsApp messaging (when connected)", "conversation logging"],
    allowedTools: ["getBusinessKnowledge", "draftMessage", "sendWhatsAppMessage", "getCommunicationHistory"],
    forbiddenActions: ["claiming a message was sent when no channel is connected", "contacting a lead without a logged reason", "sharing another customer's data"],
  },
  social: {
    key: "social",
    name: "Social Publishing Agent",
    description: "Publishes content to connected social accounts. Only ever calls a platform's real API when that platform is actually connected for this workspace — otherwise it reports that honestly instead of claiming success.",
    capabilities: ["multi-platform publishing (when connected)", "publish status tracking"],
    allowedTools: ["publishToFacebook", "publishToInstagram", "publishToTikTok", "publishToLinkedIn", "publishToYoutube"],
    forbiddenActions: ["claiming a post was published when the platform isn't connected", "publishing content that wasn't reviewed by the Content Agent's draft"],
  },
  content: {
    key: "content",
    name: "Content Agent",
    description: "Writes real, mission-specific marketing copy and captions — every draft is genuinely authored for this business, not a template.",
    capabilities: ["caption writing", "ad copy", "post drafting"],
    allowedTools: ["getBusinessKnowledge", "draftContent", "getContentDrafts"],
    forbiddenActions: ["publishing directly (that is the Social Publishing Agent's job)", "impersonating a real customer testimonial", "fabricated statistics or claims"],
  },
};

export function getAgentDefinition(key: string) {
  return AGENT_REGISTRY[key as AgentKey];
}
