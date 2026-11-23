import { GoogleGenAI } from "@google/genai";
import {
  toGeminiTool,
  toOpenAITool,
} from "@/lib/tools/json-schema";
import type { KwachaToolDefinition } from "@/lib/tools/types";

export type AIProvider =
  | "groq"
  | "openrouter"
  | "mistral"
  | "gemini";

export type AIChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  toolCallId?: string;
  name?: string;
};

export type AIToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AICompletion = {
  provider: AIProvider;
  model: string;
  text: string;
  toolCalls: AIToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
};

export class AIProviderError extends Error {
  provider: AIProvider;
  model: string;
  retryable: boolean;
  status?: number;
  skipProvider: boolean;
  deterministic: boolean;

  constructor(
    message: string,
    provider: AIProvider,
    model: string,
    retryable: boolean,
    status?: number,
    extras?: { skipProvider?: boolean; deterministic?: boolean }
  ) {
    super(message);
    this.name = "AIProviderError";
    this.provider = provider;
    this.model = model;
    this.retryable = retryable;
    this.status = status;
    this.skipProvider = extras?.skipProvider === true;
    this.deterministic = extras?.deterministic === true;
  }
}

export type Candidate = {
  provider: AIProvider;
  model: string;
};

const cooldownUntil = new Map<string, number>();

const DEFAULT_GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
];

const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_COOLDOWN_MS = 60000;
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]+/g,
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
  /api[_-]?key["']?\s*[:=]\s*["'][^"']+/gi,
];

function redactSecrets(value: string): string {
  let next = value;
  for (const pattern of SECRET_PATTERNS) {
    next = next.replace(pattern, "[redacted]");
  }
  return next;
}

function logAi(message: string, extra?: string) {
  console.log(`[KWACHA AI] ${message}${extra ? ` ${extra}` : ""}`);
}

function warnAi(message: string) {
  console.warn(`[KWACHA AI] ${redactSecrets(message)}`);
}

function getTimeoutMs(): number {
  const value = Number(process.env.AI_PROVIDER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(value) || value < 3000) {
    return DEFAULT_TIMEOUT_MS;
  }
  return value;
}

function getCooldownMs(): number {
  const value = Number(process.env.AI_PROVIDER_COOLDOWN_MS || DEFAULT_COOLDOWN_MS);
  if (!Number.isFinite(value) || value < 1000) {
    return DEFAULT_COOLDOWN_MS;
  }
  return value;
}

function csv(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function stripProviderPrefix(provider: AIProvider, model: string): string {
  const prefixes = [`${provider}/`, "groq/"];
  for (const prefix of prefixes) {
    if (model.startsWith(prefix)) {
      return model.slice(prefix.length);
    }
  }
  return model;
}

export function configuredCandidates(): Candidate[] {
  const candidates: Candidate[] = [];

  if (process.env.GROQ_API_KEY) {
    const models = csv(process.env.GROQ_MODELS);
    for (const model of models.length ? models : DEFAULT_GROQ_MODELS) {
      candidates.push({
        provider: "groq",
        model: stripProviderPrefix("groq", model),
      });
    }
  }

  if (process.env.OPENROUTER_API_KEY) {
    candidates.push({
      provider: "openrouter",
      model: process.env.OPENROUTER_MODEL || "openrouter/free",
    });
  }

  if (process.env.MISTRAL_API_KEY) {
    candidates.push({
      provider: "mistral",
      model: process.env.MISTRAL_MODEL || "mistral-large-latest",
    });
  }

  if (process.env.GEMINI_API_KEY) {
    candidates.push({
      provider: "gemini",
      model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
    });
  }

  return candidates;
}

export function classifyProviderFailure(params: {
  status?: number;
  message: string;
}): {
  retryable: boolean;
  skipProvider: boolean;
  skipRemainingProviderModels: boolean;
  deterministic: boolean;
} {
  const message = params.message.toLowerCase();
  const status = params.status;

  const modelUnavailable =
    status === 404 ||
    message.includes("does not exist") ||
    message.includes("do not have access") ||
    message.includes("model not found") ||
    message.includes("unknown model") ||
    message.includes("invalid model");

  const invalidSchema =
    message.includes("invalid json schema") ||
    message.includes("invalid schema") ||
    message.includes("got string, want array") ||
    message.includes("want array");

  const authFailure =
    status === 401 ||
    status === 403 ||
    message.includes("invalid api key") ||
    message.includes("incorrect api key");

  const providerOutage =
    status === 502 ||
    status === 503 ||
    status === 504;

  const retryableStatus = [408, 409, 425, 429, 500, 502, 503, 504].includes(
    status || 0
  );

  const retryableMessage = [
    "timeout",
    "timed out",
    "aborted",
    "rate limit",
    "too many requests",
    "temporarily unavailable",
    "overloaded",
    "capacity",
    "service unavailable",
    "connection reset",
    "fetch failed",
    "network",
    "econnreset",
    "etimedout",
  ].some((needle) => message.includes(needle));

  if (authFailure) {
    return {
      retryable: false,
      skipProvider: true,
      skipRemainingProviderModels: true,
      deterministic: true,
    };
  }

  if (invalidSchema || modelUnavailable) {
    return {
      retryable: true,
      skipProvider: false,
      skipRemainingProviderModels: false,
      deterministic: invalidSchema,
    };
  }

  if (providerOutage) {
    return {
      retryable: true,
      skipProvider: false,
      skipRemainingProviderModels: true,
      deterministic: false,
    };
  }

  return {
    retryable: retryableStatus || retryableMessage,
    skipProvider: false,
    skipRemainingProviderModels: false,
    deterministic: false,
  };
}

function candidateKey(candidate: Candidate): string {
  return `${candidate.provider}:${candidate.model}`;
}

function isAvailable(candidate: Candidate): boolean {
  return (cooldownUntil.get(candidateKey(candidate)) || 0) <= Date.now();
}

function putOnCooldown(candidate: Candidate, extraMs = 0) {
  cooldownUntil.set(candidateKey(candidate), Date.now() + getCooldownMs() + extraMs);
}

export function resetProviderCooldowns() {
  cooldownUntil.clear();
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Provider request timed out after ${getTimeoutMs()}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toolsForProvider(
  provider: AIProvider,
  tools: KwachaToolDefinition[] | undefined
) {
  if (!tools?.length) {
    return undefined;
  }

  if (provider === "gemini") {
    return tools.map(toGeminiTool);
  }

  return tools.map((tool) =>
    toOpenAITool(tool, { typeAsArray: provider === "groq" })
  );
}

function parseJsonArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

export function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  return trimmed;
}

export function parseJson(text: string): unknown {
  const cleaned = stripJsonFences(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    const positions = [cleaned.indexOf("{"), cleaned.indexOf("[")].filter(
      (value) => value >= 0
    );

    if (!positions.length) {
      throw new Error("Invalid JSON response.");
    }

    const start = Math.min(...positions);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));

    if (Number.isFinite(start) && start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }

    throw new Error("Invalid JSON response.");
  }
}

async function openAICompatible(
  candidate: Candidate,
  systemInstruction: string,
  messages: AIChatMessage[],
  tools: KwachaToolDefinition[] | undefined
): Promise<AICompletion> {
  const base =
    candidate.provider === "groq"
      ? "https://api.groq.com/openai/v1"
      : candidate.provider === "openrouter"
        ? "https://openrouter.ai/api/v1"
        : "https://api.mistral.ai/v1";

  const apiKey =
    candidate.provider === "groq"
      ? process.env.GROQ_API_KEY
      : candidate.provider === "openrouter"
        ? process.env.OPENROUTER_API_KEY
        : process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    throw new AIProviderError(
      `${candidate.provider} API key is missing.`,
      candidate.provider,
      candidate.model,
      false,
      undefined,
      { skipProvider: true, deterministic: true }
    );
  }

  const convertedTools = toolsForProvider(candidate.provider, tools);

  const bodyMessages: Record<string, unknown>[] = [
    {
      role: "system",
      content: systemInstruction,
    },
    ...messages.map((message) => {
      if (message.role === "assistant" && message.toolCalls?.length) {
        return {
          role: "assistant",
          content: message.content || null,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments),
            },
          })),
        };
      }

      if (message.role === "tool") {
        return {
          role: "tool",
          tool_call_id: message.toolCallId,
          name: message.name,
          content: message.content,
        };
      }

      return {
        role: message.role,
        content: message.content,
      };
    }),
  ];

  const body: Record<string, unknown> = {
    model: candidate.model,
    messages: bodyMessages,
    temperature: 0.35,
  };

  if (convertedTools?.length) {
    body.tools = convertedTools;
    body.tool_choice = "auto";
  }

  if (candidate.provider === "openrouter") {
    body.route = "fallback";
    body.provider = { allow_fallbacks: true };
  }

  let response: Response;

  try {
    response = await fetchWithTimeout(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(candidate.provider === "openrouter"
          ? {
              "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
              "X-Title": "Kwacha OS",
            }
          : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AIProviderError(
      `${candidate.provider}/${candidate.model} network request failed: ${message}`,
      candidate.provider,
      candidate.model,
      true
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `${candidate.provider} request failed (${response.status}).`;

    const classified = classifyProviderFailure({
      status: response.status,
      message,
    });

    throw new AIProviderError(
      message,
      candidate.provider,
      candidate.model,
      classified.retryable,
      response.status,
      {
        skipProvider: classified.skipProvider || classified.skipRemainingProviderModels,
        deterministic: classified.deterministic,
      }
    );
  }

  const choice = data?.choices?.[0];
  const message = choice?.message || {};

  const toolCalls: AIToolCall[] = Array.isArray(message.tool_calls)
    ? message.tool_calls
        .map((call: { id?: string; function?: { name?: string; arguments?: unknown } }, index: number) => ({
          id: call.id || `${candidate.provider}-tool-${Date.now()}-${index}`,
          name: call.function?.name || "",
          arguments: parseJsonArguments(call.function?.arguments),
        }))
        .filter((call: AIToolCall) => Boolean(call.name))
    : [];

  return {
    provider: candidate.provider,
    model: candidate.model,
    text: typeof message.content === "string" ? message.content : "",
    toolCalls,
    usage: {
      promptTokens: Number(data?.usage?.prompt_tokens || 0),
      completionTokens: Number(data?.usage?.completion_tokens || 0),
    },
  };
}

async function geminiCompletion(
  candidate: Candidate,
  systemInstruction: string,
  messages: AIChatMessage[],
  tools: KwachaToolDefinition[] | undefined
): Promise<AICompletion> {
  const keyValue = process.env.GEMINI_API_KEY;

  if (!keyValue) {
    throw new AIProviderError(
      "Gemini API key is missing.",
      "gemini",
      candidate.model,
      false,
      undefined,
      { skipProvider: true, deterministic: true }
    );
  }

  const ai = new GoogleGenAI({ apiKey: keyValue });
  const geminiTools = tools?.length ? tools.map(toGeminiTool) : undefined;

  const contents = messages.map((message) => {
    if (message.role === "user") {
      return {
        role: "user",
        parts: [{ text: message.content }],
      };
    }

    if (message.role === "assistant") {
      const parts: Array<Record<string, unknown>> = [];
      if (message.content) {
        parts.push({ text: message.content });
      }
      for (const call of message.toolCalls || []) {
        parts.push({
          functionCall: {
            name: call.name,
            args: call.arguments,
            id: call.id,
          },
        });
      }
      return { role: "model", parts };
    }

    return {
      role: "user",
      parts: [
        {
          functionResponse: {
            name: message.name,
            response: parseJsonArguments(message.content),
            id: message.toolCallId,
          },
        },
      ],
    };
  });

  try {
    const request = ai.models.generateContent({
      model: candidate.model,
      contents,
      config: {
        systemInstruction,
        temperature: 0.35,
        ...(geminiTools?.length
          ? {
              tools: [{ functionDeclarations: geminiTools }],
            }
          : {}),
      },
    });

    const result = await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Gemini request timed out after ${getTimeoutMs()}ms.`));
        }, getTimeoutMs());
      }),
    ]);

    const rawText = (result as { text?: unknown }).text;
    const text =
      typeof rawText === "string"
        ? rawText
        : typeof rawText === "function"
          ? (rawText as () => string)()
          : "";

    const calls: AIToolCall[] = ((result as { functionCalls?: Array<{ id?: string; name: string; args?: Record<string, unknown> }> }).functionCalls || []).map(
      (call, index) => ({
        id: call.id || `gemini-tool-${Date.now()}-${index}`,
        name: call.name,
        arguments: call.args || {},
      })
    );

    return {
      provider: "gemini",
      model: candidate.model,
      text: text || "",
      toolCalls: calls,
      usage: {
        promptTokens: Number(
          (result as { usageMetadata?: { promptTokenCount?: number } }).usageMetadata
            ?.promptTokenCount || 0
        ),
        completionTokens: Number(
          (result as { usageMetadata?: { candidatesTokenCount?: number } }).usageMetadata
            ?.candidatesTokenCount || 0
        ),
      },
    };
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const classified = classifyProviderFailure({ message });

    throw new AIProviderError(
      `Gemini request failed: ${message}`,
      "gemini",
      candidate.model,
      classified.retryable,
      undefined,
      {
        skipProvider: classified.skipProvider,
        deterministic: classified.deterministic,
      }
    );
  }
}

export async function complete(
  systemInstruction: string,
  messages: AIChatMessage[],
  tools: KwachaToolDefinition[] | undefined,
  expectJson: boolean,
  context?: { agentKey?: string }
): Promise<AICompletion> {
  const allCandidates = configuredCandidates();

  if (!allCandidates.length) {
    throw new Error(
      "No AI providers are configured. Add GROQ_API_KEY first, then optional OPENROUTER_API_KEY, MISTRAL_API_KEY, or GEMINI_API_KEY."
    );
  }

  if (context?.agentKey) {
    logAi(`Agent: ${context.agentKey}`);
  }

  const available = allCandidates.filter(isAvailable);
  const usableCandidates = available.length ? available : allCandidates;
  const errors: string[] = [];
  const skippedProviders = new Set<AIProvider>();

  for (const candidate of usableCandidates) {
    if (skippedProviders.has(candidate.provider)) {
      continue;
    }

    const startedAt = Date.now();

    try {
      logAi(`Candidate: ${candidate.provider}/${candidate.model}`);
      if (tools?.length) {
        logAi(`Tool count: ${tools.length}`);
        logAi("Tool schema validation: PASS");
      }
      logAi("Request started");

      const result =
        candidate.provider === "gemini"
          ? await geminiCompletion(candidate, systemInstruction, messages, tools)
          : await openAICompatible(candidate, systemInstruction, messages, tools);

      if (expectJson) {
        try {
          parseJson(result.text);
        } catch {
          const message = `${candidate.provider}/${candidate.model} returned invalid JSON.`;
          putOnCooldown(candidate);
          errors.push(message);
          warnAi(`Candidate failed`);
          warnAi(`Provider: ${candidate.provider}`);
          warnAi(`Model: ${candidate.model}`);
          warnAi(`Retryable: true`);
          warnAi("Falling back");
          continue;
        }
      }

      logAi("Success");
      logAi(`Provider: ${candidate.provider}`);
      logAi(`Model: ${candidate.model}`);
      logAi(`Tool calls: ${result.toolCalls.length}`);
      logAi(`Duration: ${Date.now() - startedAt}ms`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const providerError = error instanceof AIProviderError ? error : null;
      const classified = classifyProviderFailure({
        status: providerError?.status,
        message,
      });

      errors.push(`${candidate.provider}/${candidate.model}: ${redactSecrets(message)}`);
      putOnCooldown(candidate);

      warnAi("Candidate failed");
      warnAi(`Provider: ${candidate.provider}`);
      warnAi(`Model: ${candidate.model}`);
      if (providerError?.status) {
        warnAi(`Status: ${providerError.status}`);
      }
      warnAi(`Retryable: ${providerError?.retryable ?? classified.retryable}`);
      warnAi(`Falling back`);

      if (
        providerError?.skipProvider ||
        classified.skipProvider ||
        classified.skipRemainingProviderModels
      ) {
        skippedProviders.add(candidate.provider);
      }

      const next = usableCandidates.find(
        (item) =>
          !skippedProviders.has(item.provider) &&
          candidateKey(item) !== candidateKey(candidate) &&
          isAvailable(item)
      );

      if (next) {
        logAi(`Trying ${next.provider}/${next.model}`);
      }
    }
  }

  throw new AIProviderError(
    `All configured AI providers/models failed. ${errors.join(" | ")}`,
    usableCandidates[0]?.provider || "gemini",
    usableCandidates[0]?.model || "unknown",
    true
  );
}

export async function aiCompleteJson<T>(
  systemInstruction: string,
  prompt: string,
  context?: { agentKey?: string }
): Promise<AICompletion & { parsed: T }> {
  const result = await complete(
    `${systemInstruction}

IMPORTANT:
Return ONLY valid JSON.
Do not use markdown fences.
Do not add commentary outside the JSON.`,
    [{ role: "user", content: prompt }],
    undefined,
    true,
    context
  );

  return {
    ...result,
    parsed: parseJson(result.text) as T,
  };
}

export async function aiCompleteWithTools(
  systemInstruction: string,
  messages: AIChatMessage[],
  tools: KwachaToolDefinition[],
  context?: { agentKey?: string }
): Promise<AICompletion> {
  return complete(systemInstruction, messages, tools, false, context);
}

export function aiProviderOrder(): string[] {
  return configuredCandidates().map(
    (candidate) => `${candidate.provider}/${candidate.model}`
  );
}
