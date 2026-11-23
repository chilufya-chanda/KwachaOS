import {
  AIProviderAdapter,
  AIRequest,
  AIResponse,
} from "../provider-types";
import { callOpenAICompatible } from "./openai-compatible";

export const mistralProvider: AIProviderAdapter = {
  name: "mistral",

  getModels() {
    return [
      process.env.MISTRAL_MODEL?.trim() ||
        "mistral-small-latest",
    ];
  },

  async generate(
    request: AIRequest,
    model: string
  ): Promise<AIResponse> {
    const apiKey =
      process.env.MISTRAL_API_KEY;

    if (!apiKey) {
      throw new Error(
        "MISTRAL_API_KEY is not configured."
      );
    }

    return callOpenAICompatible({
      provider: "mistral",
      baseUrl: "https://api.mistral.ai/v1",
      apiKey,
      model,
      request,
    });
  },
};
