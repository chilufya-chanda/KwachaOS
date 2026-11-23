import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const agents = [
    ["research", "Research Agent", "Market and customer research."],
    ["marketing", "Marketing Agent", "Campaign planning and acquisition."],
    ["sales", "Sales Agent", "Lead qualification and sales workflows."],
    ["analytics", "Analytics Agent", "Performance measurement and analysis."],
    ["markets", "Markets Agent", "Synthetic market intelligence and paper trading."],
    ["crm", "CRM Agent", "Manages real lead and customer records."],
    ["communication", "Communication Agent", "Drafts and, when connected, sends real customer messages."],
    ["social", "Social Publishing Agent", "Publishes to connected social accounts."],
    ["content", "Content Agent", "Writes real, mission-specific marketing copy."],
  ] as const;
  for (const [key, name, description] of agents) {
    await prisma.agent.upsert({ where: { key }, update: { name, description }, create: { key, name, description } });
  }
  const tools = [
    ["getBusinessKnowledge", "Get Business Knowledge", "Retrieve approved business knowledge on demand.", "knowledge"],
    ["webSearch", "Web Search", "Real live web search via Tavily.", "research"],
    ["searchMarket", "Search Market", "Record a real market research finding for this mission.", "research"],
    ["analyzeCompetitors", "Analyze Competitors", "Record a real competitor analysis finding.", "research"],
    ["identifyAudience", "Identify Audience", "Record real audience segments for this mission.", "research"],
    ["summarizeResearch", "Summarize Research", "Summarize persisted research.", "research"],
    ["createCampaign", "Create Campaign", "Create a simulated campaign.", "marketing"],
    ["simulateCampaign", "Simulate Campaign", "Record a simulated campaign execution request.", "marketing"],
    ["getCampaignMetrics", "Campaign Metrics", "Read campaign state and metrics.", "marketing"],
    ["pauseCampaign", "Pause Campaign", "Pause a simulated campaign.", "marketing"],
    ["adjustCampaign", "Adjust Campaign", "Record a real campaign adjustment decision.", "marketing"],
    ["getLeads", "Get Leads", "Read leads belonging to the mission.", "sales"],
    ["createLead", "Create Lead", "Create a real lead record.", "crm"],
    ["qualifyLead", "Qualify Lead", "Qualify a lead with a real assessment.", "sales"],
    ["updateLeadRecord", "Update Lead Record", "Update a lead's real pipeline status.", "crm"],
    ["prepareFollowUp", "Prepare Follow-up", "Prepare a simulated follow-up.", "sales"],
    ["updateLead", "Update Lead", "Record a lead workflow note.", "sales"],
    ["scheduleMeeting", "Schedule Meeting", "Record simulated meeting scheduling.", "sales"],
    ["analyzeCampaign", "Analyze Campaign", "Analyze persisted campaign state.", "analytics"],
    ["calculateMetrics", "Calculate Metrics", "Calculate current mission metrics.", "analytics"],
    ["compareCampaigns", "Compare Campaigns", "Compare persisted campaign state.", "analytics"],
    ["detectAnomaly", "Detect Anomaly", "Record a real anomaly assessment.", "analytics"],
    ["generateReport", "Generate Report", "Store an analytics report with a real written summary.", "analytics"],
    ["getBudget", "Get Budget", "Read the mission simulation budget.", "economy"],
    ["recordSimulatedSpend", "Record Simulated Spend", "Record a synthetic ledger debit.", "economy"],
    ["getRemainingBudget", "Get Remaining Budget", "Calculate remaining mission budget.", "economy"],
    ["recordAttributedRevenue", "Record Attributed Revenue", "Record synthetic attributed revenue.", "economy"],
    ["getMarketData", "Get Market Data", "Read synthetic market instruments.", "markets"],
    ["analyzeMarket", "Analyze Market", "Analyze synthetic market conditions.", "markets"],
    ["calculateRisk", "Calculate Risk", "Estimate paper-trading risk.", "markets"],
    ["simulateTrade", "Simulate Trade", "Open a paper position only.", "markets"],
    ["closePaperPosition", "Close Paper Position", "Close a simulated paper position.", "markets"],
    ["tickMarkets", "Tick Markets", "Advance synthetic market prices.", "markets"],
    ["draftContent", "Draft Content", "Save a real piece of authored content.", "content"],
    ["getContentDrafts", "Get Content Drafts", "Read previously drafted content.", "content"],
    ["draftMessage", "Draft Message", "Save a drafted customer message for review.", "communication"],
    ["sendWhatsAppMessage", "Send WhatsApp Message", "Send a real WhatsApp message if connected.", "communication"],
    ["getCommunicationHistory", "Get Communication History", "Read this mission's message history.", "communication"],
    ["publishToFacebook", "Publish to Facebook", "Publish real content to Facebook if connected.", "social"],
    ["publishToInstagram", "Publish to Instagram", "Publish to Instagram (requires media, not yet supported).", "social"],
    ["publishToTikTok", "Publish to TikTok", "Publish to TikTok (requires media, not yet supported).", "social"],
    ["publishToLinkedIn", "Publish to LinkedIn", "Publish real content to LinkedIn if connected.", "social"],
    ["publishToYoutube", "Publish to YouTube", "Publish to YouTube (requires media, not yet supported).", "social"],
  ] as const;
  for (const [key, name, description, category] of tools) await prisma.tool.upsert({ where: { key }, update: { name, description, category }, create: { key, name, description, category } });
  const instruments = [
    ["KWZ-CON", "Kwacha Synthetic Construction Index", 128.4],
    ["KWZ-RTL", "Kwacha Synthetic Retail Index", 94.2],
    ["KWZ-AGR", "Kwacha Synthetic Agriculture Index", 61.75],
  ] as const;
  for (const [symbol, name, price] of instruments) await prisma.marketInstrument.upsert({ where: { symbol }, update: { name, price }, create: { symbol, name, price } });

  // Model Cost Engine (BI/Finance doc #13) needs a price on file before any
  // real Gemini call can be billed. THESE FIGURES ARE PLACEHOLDERS — verify
  // current pricing at https://ai.google.dev/pricing before relying on any
  // cost/profitability number this build produces. Values are USD per 1,000
  // tokens (the ModelPrice.unit column says so explicitly).
  const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const existingPrice = await prisma.modelPrice.findFirst({ where: { provider: "gemini", model: geminiModel } });
  if (!existingPrice) {
    await prisma.modelPrice.create({
      data: {
        provider: "gemini",
        model: geminiModel,
        inputPrice: 0.000075, // USD per 1,000 input tokens — placeholder, CONFIRM against current Google AI pricing
        outputPrice: 0.0003, // USD per 1,000 output tokens — placeholder, CONFIRM against current Google AI pricing
        currency: "USD",
        unit: "per_1k_units",
      },
    });
  }

  console.log("Kwacha OS Phase 6 simulation agents, tools, and data seeded.");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
