export type JsonSchemaType =
  | "object"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "null";

export type JsonSchema = {
  type?: JsonSchemaType;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: Array<string | number | boolean>;
  additionalProperties?: boolean;
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
};

export type KwachaToolDefinition = {
  name: string;
  description: string;
  parameters: JsonSchema;
};

export type OpenAIToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};
