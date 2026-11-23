import {
  GoogleGenAI,
  Type,
} from "@google/genai";

import {
  AIMessage,
  AIProviderAdapter,
  AIProviderError,
  AIRequest,
  AIResponse,
  AIToolCall,
  AIToolDefinition,
} from "../provider-types";

function getClient() {
  const apiKey =
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new AIProviderError({
      provider: "gemini",
      model:
        process.env.GEMINI_MODEL ||
        "gemini-3.6-flash",
      message:
        "GEMINI_API_KEY is not configured.",
      providerFatal: true,
    });
  }

  return new GoogleGenAI({ apiKey });
}

function normalizeGeminiSchema(
  value: unknown
): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeGeminiSchema);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (key === "type" && typeof rawValue === "string") {
      const normalized =
        rawValue.toUpperCase();

      const typeValue =
        (Type as Record<string, unknown>)[
          normalized
        ];

      result[key] =
        typeValue ?? rawValue;
      continue;
    }

    result[key] = normalizeGeminiSchema(
      rawValue
    );
  }

  if (!result.type && result.properties) {
    result.type = Type.OBJECT;
  }

  return result;
}

function toGeminiTools(
  tools: AIToolDefinition[] | undefined
) {
  return (tools ?? []).map((tool) => ({
    name: tool.function.name,
    ...(tool.function.description
      ? {
          description:
            tool.function.description,
        }
      : {}),
    ...(tool.function.parameters
      ? {
          parameters:
            normalizeGeminiSchema(
              tool.function.parameters
            ),
        }
      : {
          parameters: {
            type: Type.OBJECT,
            properties: {},
          },
        }),
  }));
}

function safeParseJson(
  text: string
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);

    if (
      parsed &&
      typeof parsed === "object"
    ) {
      return parsed as Record<
        string,
        unknown
      >;
    }
  } catch {
    // Fall through to a text wrapper.
  }

  return { result: text };
}

function toGeminiContents(
  messages: AIMessage[]
) {
  const contents: any[] = [];

  for (const message of messages) {
    if (
      message.role === "user"
    ) {
      contents.push({
        role: "user",
        parts: [
          {
            text: message.content,
          },
        ],
      });
      continue;
    }

    if (
      message.role === "assistant"
    ) {
      const parts: any[] = [];

      if (message.content) {
        parts.push({
          text: message.content,
        });
      }

      for (const call of
        message.tool_calls ?? []) {
        parts.push({
          functionCall: {
            name:
              call.function.name,
            args: safeParseJson(
              call.function.arguments
            ),
            id: call.id,
          },
        });
      }

      if (parts.length) {
        contents.push({
          role: "model",
          parts,
        });
      }

      continue;
    }

    if (message.role === "tool") {
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: message.name,
              response:
                safeParseJson(
                  message.content
                ),
              id: message.tool_call_id,
            },
          },
        ],
      });
    }
  }

  return contents;
}

function getResponseText(
  response: unknown
): string {
  const value =
    (response as {
      text?: unknown;
    })?.text;

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "function") {
    try {
      const result =
        (value as () => unknown)();

      return typeof result ===
        "string"
        ? result
        : "";
    } catch {
      return "";
    }
  }

  return "";
}

function parseToolCalls(
  result: any,
  model: string
): AIToolCall[] {
  const calls =
    result.functionCalls ?? [];

  return calls.flatMap(
    (call: any, index: number) => {
      const name =
        typeof call?.name === "string"
          ? call.name
          : "";

      if (!name) {
        return [];
      }

      return [
        {
          id:
            typeof call?.id ===
              "string" &&
            call.id
              ? call.id
              : `gemini_${model}_${Date.now()}_${index}`,
          name,
          args:
            call?.args &&
            typeof call.args === "object"
              ? call.args
              : {},
        },
      ];
    }
  );
}

export const geminiProvider: AIProviderAdapter = {
  name: "gemini",

  getModels() {
    return [
      process.env.GEMINI_MODEL?.trim() ||
        "gemini-3.6-flash",
    ];
  },

  async generate(
    request: AIRequest,
    model: string
  ): Promise<AIResponse> {
    try {
      const ai = getClient();

      const config: Record<string, unknown> = {};

      if (request.systemInstruction) {
        config.systemInstruction =
          request.systemInstruction;
      }

      if (
        request.jsonMode &&
        !request.tools?.length
      ) {
        config.responseMimeType =
          "application/json";
      }

      if (request.tools?.length) {
        config.tools = [
          {
            functionDeclarations:
              toGeminiTools(
                request.tools
              ),
          },
        ];
      }

      const result =
        await ai.models.generateContent({
          model,
          contents: toGeminiContents(
            request.messages
          ),
          config,
        });

      const text =
        getResponseText(result).trim();

      const toolCalls =
        parseToolCalls(result, model);

      const inputTokens =
        Number(
          result.usageMetadata
            ?.promptTokenCount
        ) || 0;

      const outputTokens =
        Number(
          result.usageMetadata
            ?.candidatesTokenCount
        ) || 0;

      return {
        provider: "gemini",
        model,
        text,
        toolCalls,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens:
            inputTokens +
            outputTokens,
        },
      };
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Gemini request failed.";

      const status =
        typeof (error as any)?.status ===
        "number"
          ? (error as any).status
          : typeof (error as any)?.statusCode ===
              "number"
            ? (error as any).statusCode
            : undefined;

      const retryable =
        status === 408 ||
        status === 409 ||
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        /temporarily|unavailable|high demand|overloaded|capacity/i.test(
          message
        );

      throw new AIProviderError({
        provider: "gemini",
        model,
        status,
        message,
        retryable,
        providerFatal:
          status === 401 ||
          status === 403 ||
          /api.?key|credential|authentication/i.test(
            message
          ),
      });
    }
  },
};
