import {
  AIMessage,
  AIProviderError,
  AIProviderName,
  AIRequest,
  AIResponse,
  AIToolCall,
  AIToolDefinition,
} from "../provider-types";

type OpenAICompatibleOptions = {
  provider: Exclude<AIProviderName, "gemini">;
  baseUrl: string;
  apiKey: string;
  model: string;
  request: AIRequest;
  headers?: Record<string, string>;
};

function normalizeSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeSchema);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (key === "type" && typeof rawValue === "string") {
      const normalized = rawValue.toLowerCase();

      const allowed = new Set([
        "object",
        "string",
        "number",
        "integer",
        "boolean",
        "array",
        "null",
      ]);

      result[key] = allowed.has(normalized)
        ? normalized
        : rawValue;
      continue;
    }

    result[key] = normalizeSchema(rawValue);
  }

  if (!result.type && result.properties) {
    result.type = "object";
  }

  return result;
}

export function toOpenAITools(
  tools: AIToolDefinition[] | undefined
) {
  return (tools ?? []).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.function.name,
      ...(tool.function.description
        ? { description: tool.function.description }
        : {}),
      parameters: normalizeSchema(
        tool.function.parameters ?? {
          type: "OBJECT",
          properties: {},
        }
      ),
    },
  }));
}

function buildMessages(request: AIRequest) {
  const messages: Array<Record<string, unknown>> = [];

  if (request.systemInstruction) {
    messages.push({
      role: "system",
      content: request.systemInstruction,
    });
  }

  for (const message of request.messages) {
    if (message.role === "assistant") {
      messages.push({
        role: "assistant",
        content: message.content ?? "",
        ...(message.tool_calls?.length
          ? { tool_calls: message.tool_calls }
          : {}),
      });
    } else if (message.role === "tool") {
      messages.push({
        role: "tool",
        tool_call_id: message.tool_call_id,
        name: message.name,
        content: message.content,
      });
    } else {
      messages.push({
        role: message.role,
        content: message.content,
      });
    }
  }

  return messages;
}

function parseToolArguments(
  value: unknown
): Record<string, unknown> {
  if (typeof value !== "string") {
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function extractToolCalls(
  message: Record<string, unknown>,
  provider: AIProviderName,
  model: string
): AIToolCall[] {
  const raw = Array.isArray(message.tool_calls)
    ? message.tool_calls
    : [];

  return raw.flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const row = item as Record<string, unknown>;
    const fn =
      row.function && typeof row.function === "object"
        ? (row.function as Record<string, unknown>)
        : null;

    const name =
      typeof fn?.name === "string" ? fn.name : "";

    if (!name) {
      return [];
    }

    const id =
      typeof row.id === "string" && row.id
        ? row.id
        : `${provider}_${model}_${Date.now()}_${index}`;

    return [
      {
        id,
        name,
        args: parseToolArguments(fn?.arguments),
      },
    ];
  });
}

function getStatusMessage(
  provider: AIProviderName,
  model: string,
  status: number,
  body: string
) {
  let parsed = "";

  try {
    const json = JSON.parse(body);
    parsed =
      json?.error?.message ||
      json?.message ||
      "";
  } catch {
    parsed = "";
  }

  return (
    parsed ||
    `${provider} request failed with HTTP ${status} for model ${model}.`
  );
}

function isRetryableStatus(status: number) {
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

export async function callOpenAICompatible(
  options: OpenAICompatibleOptions
): Promise<AIResponse> {
  const endpoint =
    `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const body: Record<string, unknown> = {
    model: options.model,
    messages: buildMessages(options.request),
  };

  if (options.request.tools?.length) {
    body.tools = toOpenAITools(options.request.tools);
    body.tool_choice = "auto";
  }

  if (
    typeof options.request.temperature === "number" &&
    options.request.temperature > 0
  ) {
    body.temperature = options.request.temperature;
  }

  if (options.request.jsonMode && !options.request.tools?.length) {
    body.response_format = {
      type: "json_object",
    };
  }

  const controller = new AbortController();
  const timeoutMs =
    Number(process.env.AI_PROVIDER_TIMEOUT_MS || 45000);

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      body: JSON.stringify(body),
    });

    const rawBody = await response.text();

    if (!response.ok) {
      const status = response.status;

      throw new AIProviderError({
        provider: options.provider,
        model: options.model,
        status,
        message: getStatusMessage(
          options.provider,
          options.model,
          status,
          rawBody
        ),
        retryable:
          isRetryableStatus(status) || status === 404,
        providerFatal:
          status === 401 || status === 403,
      });
    }

    let data: Record<string, any>;

    try {
      data = JSON.parse(rawBody);
    } catch {
      throw new AIProviderError({
        provider: options.provider,
        model: options.model,
        message:
          "The provider returned an invalid JSON response.",
        retryable: true,
      });
    }

    const message =
      data?.choices?.[0]?.message;

    if (
      !message ||
      typeof message !== "object"
    ) {
      throw new AIProviderError({
        provider: options.provider,
        model: options.model,
        message:
          "The provider returned no usable assistant message.",
        retryable: true,
      });
    }

    const toolCalls = extractToolCalls(
      message,
      options.provider,
      options.model
    );

    const text =
      typeof message.content === "string"
        ? message.content
        : "";

    const inputTokens =
      Number(data?.usage?.prompt_tokens) || 0;

    const outputTokens =
      Number(data?.usage?.completion_tokens) || 0;

    return {
      provider: options.provider,
      model: options.model,
      text,
      toolCalls,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens:
          Number(data?.usage?.total_tokens) ||
          inputTokens + outputTokens,
      },
      finishReason:
        data?.choices?.[0]?.finish_reason ?? null,
    };
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new AIProviderError({
        provider: options.provider,
        model: options.model,
        message:
          `The ${options.provider} request timed out after ${timeoutMs}ms.`,
        retryable: true,
      });
    }

    throw new AIProviderError({
      provider: options.provider,
      model: options.model,
      message:
        error instanceof Error
          ? error.message
          : "The AI provider request failed.",
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}
