import type { FunctionDeclaration } from "@google/genai";
import {
  logToolSchemaValidation,
  toGeminiTool,
} from "./json-schema";
import type { JsonSchema, KwachaToolDefinition } from "./types";

/**
 * Provider-neutral tool definitions.
 *
 * Adapters in src/lib/tools/json-schema.ts convert these into:
 * OpenAI / Groq / Mistral / Gemini formats.
 */

const objectSchema = (
  properties: Record<string, JsonSchema>,
  required: string[] = []
): JsonSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const emptyObject: JsonSchema = objectSchema({});

const stringProp = (description: string): JsonSchema => ({
  type: "string",
  description,
});

const numberProp = (description?: string): JsonSchema => ({
  type: "number",
  ...(description ? { description } : {}),
});

export const KWACHA_TOOLS: Record<string, KwachaToolDefinition> = {
  getBusinessKnowledge: {
    name: "getBusinessKnowledge",
    description:
      "Retrieve approved business knowledge (about, products, prices, FAQs, policies, etc.) for this business, on demand.",
    parameters: objectSchema({
      category: stringProp(
        "Optional category filter: about | products | services | prices | faqs | policies | hours | locations | delivery | refund | contact | promotions | brand_voice | other"
      ),
    }),
  },

  webSearch: {
    name: "webSearch",
    description:
      "Search the real, live web for current information relevant to this mission (via Tavily). Use this before writing findings so they're grounded in real current data, not just your training knowledge.",
    parameters: objectSchema(
      {
        query: stringProp("The search query"),
      },
      ["query"]
    ),
  },

  searchMarket: {
    name: "searchMarket",
    description:
      "Record a specific market research finding for this mission, based on your own knowledge of this business's industry and location.",
    parameters: objectSchema(
      {
        finding: stringProp("The specific finding, written for this business."),
      },
      ["finding"]
    ),
  },

  analyzeCompetitors: {
    name: "analyzeCompetitors",
    description:
      "Record a specific competitor analysis finding for this mission's actual industry and location.",
    parameters: objectSchema(
      {
        finding: stringProp("The specific competitive finding."),
      },
      ["finding"]
    ),
  },

  identifyAudience: {
    name: "identifyAudience",
    description:
      "Record the specific target audience segments you've identified for this business's actual objective.",
    parameters: objectSchema(
      {
        segments: stringProp("The specific audience segments and why they fit."),
      },
      ["segments"]
    ),
  },

  summarizeResearch: {
    name: "summarizeResearch",
    description: "Record a summary of the research gathered so far for this mission.",
    parameters: objectSchema(
      {
        summary: stringProp("The research summary."),
      },
      ["summary"]
    ),
  },

  createCampaign: {
    name: "createCampaign",
    description: "Create a new simulated marketing campaign.",
    parameters: objectSchema({
      name: stringProp("Campaign name."),
    }),
  },

  simulateCampaign: {
    name: "simulateCampaign",
    description:
      "Run a simulation cycle for a campaign, generating synthetic leads and spend.",
    parameters: objectSchema({
      campaignId: stringProp(
        "The campaign to simulate. Omit to use the mission's active campaign."
      ),
      spend: numberProp("Simulated spend amount for this cycle."),
    }),
  },

  getCampaignMetrics: {
    name: "getCampaignMetrics",
    description: "Retrieve current metrics for all campaigns on this mission.",
    parameters: emptyObject,
  },

  pauseCampaign: {
    name: "pauseCampaign",
    description: "Pause a specific campaign.",
    parameters: objectSchema(
      {
        campaignId: stringProp("The campaign to pause."),
      },
      ["campaignId"]
    ),
  },

  adjustCampaign: {
    name: "adjustCampaign",
    description: "Record a specific, real adjustment decision for this campaign.",
    parameters: objectSchema(
      {
        note: stringProp("What changed and why."),
      },
      ["note"]
    ),
  },

  getLeads: {
    name: "getLeads",
    description: "Retrieve the mission's current leads.",
    parameters: emptyObject,
  },

  createLead: {
    name: "createLead",
    description: "Create a new real lead record for this mission.",
    parameters: objectSchema(
      {
        name: stringProp("Lead's name or company name."),
        contact: stringProp("Phone, email, or other contact reference."),
        interest: stringProp("What they're interested in."),
        budget: numberProp("Estimated budget, if known."),
        qualification: stringProp("unqualified | low | medium | high"),
      },
      ["name"]
    ),
  },

  qualifyLead: {
    name: "qualifyLead",
    description: "Qualify a specific lead with your actual assessment.",
    parameters: objectSchema(
      {
        leadId: stringProp("The lead to qualify."),
        qualification: stringProp("low | medium | high, based on your real assessment."),
      },
      ["leadId", "qualification"]
    ),
  },

  updateLeadRecord: {
    name: "updateLeadRecord",
    description: "Update a lead's real pipeline status.",
    parameters: objectSchema(
      {
        leadId: stringProp("The lead to update."),
        status: stringProp("new | qualified | contacted | won | lost"),
      },
      ["leadId", "status"]
    ),
  },

  updateLead: {
    name: "updateLead",
    description:
      "Record a workflow note about a lead that doesn't fit a status change.",
    parameters: objectSchema(
      {
        note: stringProp("Workflow note."),
      },
      ["note"]
    ),
  },

  prepareFollowUp: {
    name: "prepareFollowUp",
    description:
      "Record a specific follow-up plan for recent leads (simulated — does not send anything).",
    parameters: objectSchema(
      {
        plan: stringProp("Follow-up plan."),
      },
      ["plan"]
    ),
  },

  scheduleMeeting: {
    name: "scheduleMeeting",
    description:
      "Record simulated meeting scheduling (does not create a real calendar event).",
    parameters: objectSchema(
      {
        details: stringProp("Meeting details."),
      },
      ["details"]
    ),
  },

  analyzeCampaign: {
    name: "analyzeCampaign",
    description: "Analyze current campaign performance from simulation state.",
    parameters: emptyObject,
  },

  calculateMetrics: {
    name: "calculateMetrics",
    description: "Calculate current mission-wide performance metrics.",
    parameters: emptyObject,
  },

  compareCampaigns: {
    name: "compareCampaigns",
    description: "Compare performance across the mission's campaigns.",
    parameters: emptyObject,
  },

  detectAnomaly: {
    name: "detectAnomaly",
    description: "Record your actual anomaly assessment of current performance data.",
    parameters: objectSchema({
      finding: stringProp("Anomaly finding."),
    }),
  },

  generateReport: {
    name: "generateReport",
    description: "Generate an analytics report, including your own written summary.",
    parameters: objectSchema({
      summary: stringProp("Your written summary of performance."),
    }),
  },

  getBudget: {
    name: "getBudget",
    description: "Retrieve the mission's authorized simulation budget and spend.",
    parameters: emptyObject,
  },

  recordSimulatedSpend: {
    name: "recordSimulatedSpend",
    description:
      "Record a simulated spend event against the mission's synthetic ledger.",
    parameters: objectSchema(
      {
        amount: numberProp("Simulated amount."),
      },
      ["amount"]
    ),
  },

  getRemainingBudget: {
    name: "getRemainingBudget",
    description: "Get the mission's remaining simulation budget.",
    parameters: emptyObject,
  },

  recordAttributedRevenue: {
    name: "recordAttributedRevenue",
    description: "Record simulated revenue attributed to this mission.",
    parameters: objectSchema(
      {
        amount: numberProp("Simulated revenue amount."),
      },
      ["amount"]
    ),
  },

  getMarketData: {
    name: "getMarketData",
    description: "Retrieve synthetic market instrument data.",
    parameters: emptyObject,
  },

  analyzeMarket: {
    name: "analyzeMarket",
    description: "Analyze synthetic market instruments for paper-trading signals.",
    parameters: emptyObject,
  },

  calculateRisk: {
    name: "calculateRisk",
    description: "Estimate risk for a hypothetical paper position.",
    parameters: objectSchema({
      quantity: numberProp(),
      price: numberProp(),
    }),
  },

  simulateTrade: {
    name: "simulateTrade",
    description: "Open a simulated paper-trading position. Never a real trade.",
    parameters: objectSchema(
      {
        instrumentId: stringProp("Instrument id."),
        quantity: numberProp(),
      },
      ["instrumentId", "quantity"]
    ),
  },

  closePaperPosition: {
    name: "closePaperPosition",
    description: "Close an open simulated paper-trading position.",
    parameters: objectSchema(
      {
        positionId: stringProp("Paper position id."),
      },
      ["positionId"]
    ),
  },

  tickMarkets: {
    name: "tickMarkets",
    description: "Advance synthetic market prices by one tick.",
    parameters: emptyObject,
  },

  draftContent: {
    name: "draftContent",
    description: "Save a real, finished piece of content you've written for this business.",
    parameters: objectSchema(
      {
        body: stringProp("The actual finished caption/post/ad copy text."),
        platform: stringProp("facebook | instagram | tiktok | linkedin | youtube | generic"),
        kind: stringProp("post | caption | ad_copy"),
      },
      ["body"]
    ),
  },

  getContentDrafts: {
    name: "getContentDrafts",
    description: "Retrieve previously drafted content for this mission.",
    parameters: emptyObject,
  },

  draftMessage: {
    name: "draftMessage",
    description: "Save a drafted customer message for review (does not send it).",
    parameters: objectSchema(
      {
        body: stringProp("Message text."),
      },
      ["body"]
    ),
  },

  sendWhatsAppMessage: {
    name: "sendWhatsAppMessage",
    description:
      "Send a real WhatsApp message, but only if WhatsApp is actually connected for this workspace — otherwise this will honestly report that it isn't connected rather than pretend to send.",
    parameters: objectSchema(
      {
        to: stringProp("Recipient phone number, E.164 format."),
        body: stringProp("Message text."),
      },
      ["to", "body"]
    ),
  },

  getCommunicationHistory: {
    name: "getCommunicationHistory",
    description: "Retrieve this mission's message history.",
    parameters: emptyObject,
  },

  publishToFacebook: {
    name: "publishToFacebook",
    description:
      "Publish real text content to Facebook, but only if Facebook is connected — otherwise reports honestly that it isn't.",
    parameters: objectSchema(
      {
        content: stringProp("Post content."),
      },
      ["content"]
    ),
  },

  publishToInstagram: {
    name: "publishToInstagram",
    description:
      "Attempt to publish to Instagram. Currently always reports that image/video media is required and not yet supported.",
    parameters: objectSchema(
      {
        content: stringProp("Post content."),
      },
      ["content"]
    ),
  },

  publishToTikTok: {
    name: "publishToTikTok",
    description:
      "Attempt to publish to TikTok. Currently always reports that video media is required and not yet supported.",
    parameters: objectSchema(
      {
        content: stringProp("Post content."),
      },
      ["content"]
    ),
  },

  publishToLinkedIn: {
    name: "publishToLinkedIn",
    description:
      "Publish real text content to LinkedIn, but only if LinkedIn is connected — otherwise reports honestly that it isn't.",
    parameters: objectSchema(
      {
        content: stringProp("Post content."),
      },
      ["content"]
    ),
  },

  publishToYoutube: {
    name: "publishToYoutube",
    description:
      "Attempt to publish to YouTube. Currently always reports that video media is required and not yet supported.",
    parameters: objectSchema(
      {
        content: stringProp("Post content."),
      },
      ["content"]
    ),
  },
};

let validated = false;

export function getKwachaToolsFor(allowedTools: string[]): KwachaToolDefinition[] {
  const tools = allowedTools
    .map((key) => KWACHA_TOOLS[key])
    .filter((tool): tool is KwachaToolDefinition => Boolean(tool));

  if (!validated) {
    logToolSchemaValidation(Object.values(KWACHA_TOOLS));
    validated = true;
  }

  return tools;
}

/** @deprecated Use getKwachaToolsFor + toGeminiTool. Kept for Gemini adapter compatibility. */
export function getFunctionDeclarationsFor(
  allowedTools: string[]
): FunctionDeclaration[] {
  return getKwachaToolsFor(allowedTools).map(toGeminiTool);
}

export const TOOL_SCHEMAS: Record<string, FunctionDeclaration> = Object.fromEntries(
  Object.entries(KWACHA_TOOLS).map(([key, tool]) => [key, toGeminiTool(tool)])
);
