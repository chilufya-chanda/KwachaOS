import {
  AIProviderAdapter,
  AIRequest,
  AIResponse,
} from "../provider-types";
import { callOpenAICompatible } from "./openai-compatible";

const DEFAULT_GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "minimaxai/minimax-m2.7",
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];

function getModels() {
  const configured =
    process.env.GROQ_MODELS
      ?.split(",")
      .map((model) => model.trim())
      .filter(Boolean);

  return configured?.length
    ? configured
    : DEFAULT_GROQ_MODELS;
}

export const groqProvider: AIProviderAdapter = {
  name: "groq",

  getModels,

  async generate(
    request: AIRequest,
    model: string
  ): Promise<AIResponse> {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error(
        "GROQ_API_KEY is not configured."
      );
    }

    return callOpenAICompatible({
      provider: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey,
      model,
      request,
    });
  },
};
