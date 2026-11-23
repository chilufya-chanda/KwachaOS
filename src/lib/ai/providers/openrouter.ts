import {
  AIProviderAdapter,
  AIRequest,
  AIResponse,
} from "../provider-types";
import { callOpenAICompatible } from "./openai-compatible";

export const openRouterProvider: AIProviderAdapter = {
  name: "openrouter",

  getModels() {
    return [
      process.env.OPENROUTER_MODEL?.trim() ||
        "openrouter/free",
    ];
  },

  async generate(
    request: AIRequest,
    model: string
  ): Promise<AIResponse> {
    const apiKey =
      process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is not configured."
      );
    }

    return callOpenAICompatible({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey,
      model,
      request,
      headers: {
        "HTTP-Referer":
          process.env.APP_URL ||
          "http://localhost:3000",
        "X-Title": "Kwacha OS",
      },
    });
  },
};
