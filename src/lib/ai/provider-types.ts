export type AIProviderName =
  | "groq"
  | "openrouter"
  | "mistral"
  | "gemini";

export type AIMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string;
      tool_calls?: AIToolCallMessage[];
    }
  | {
      role: "tool";
      tool_call_id: string;
      name: string;
      content: string;
    };

export type AIToolCallMessage = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type AIToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type AIToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type AIUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AIRequest = {
  messages: AIMessage[];
  systemInstruction?: string;
  tools?: AIToolDefinition[];
  jsonMode?: boolean;
  temperature?: number;
};

export type AIResponse = {
  provider: AIProviderName;
  model: string;
  text: string;
  toolCalls: AIToolCall[];
  usage: AIUsage;
  finishReason?: string | null;
};

export type AIProviderAdapter = {
  name: AIProviderName;
  getModels(): string[];
  generate(request: AIRequest, model: string): Promise<AIResponse>;
};

export class AIProviderError extends Error {
  readonly provider: AIProviderName;
  readonly model: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly providerFatal: boolean;

  constructor(params: {
    provider: AIProviderName;
    model: string;
    message: string;
    status?: number;
    retryable?: boolean;
    providerFatal?: boolean;
  }) {
    super(params.message);
    this.name = "AIProviderError";
    this.provider = params.provider;
    this.model = params.model;
    this.status = params.status;
    this.retryable = params.retryable ?? false;
    this.providerFatal = params.providerFatal ?? false;
  }
}

export class AIProviderExhaustedError extends Error {
  readonly attempts: Array<{
    provider: AIProviderName;
    model: string;
    message: string;
    status?: number;
  }>;

  constructor(
    attempts: Array<{
      provider: AIProviderName;
      model: string;
      message: string;
      status?: number;
    }>
  ) {
    super(
      "All configured AI providers and models are temporarily unavailable."
    );
    this.name = "AIProviderExhaustedError";
    this.attempts = attempts;
  }
}

export class AIProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIProviderConfigurationError";
  }
}
