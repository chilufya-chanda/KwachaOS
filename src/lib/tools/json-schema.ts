import { Type, type FunctionDeclaration } from "@google/genai";
import type {
  JsonSchema,
  JsonSchemaType,
  KwachaToolDefinition,
  OpenAIToolDefinition,
} from "./types";

const JSON_SCHEMA_TYPES = new Set<JsonSchemaType>([
  "object",
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "null",
]);

const STRIP_KEYS = new Set([
  "$schema",
  "$ref",
  "$id",
  "$defs",
  "definitions",
  "title",
  "examples",
  "default",
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  "unevaluatedProperties",
  "propertyOrdering",
  "property_ordering",
]);

const GEMINI_TYPE: Record<JsonSchemaType, (typeof Type)[keyof typeof Type]> = {
  object: Type.OBJECT,
  string: Type.STRING,
  number: Type.NUMBER,
  integer: Type.INTEGER,
  boolean: Type.BOOLEAN,
  array: Type.ARRAY,
  null: Type.NULL,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function normalizeJsonSchemaType(value: unknown): JsonSchemaType | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeJsonSchemaType(entry);
      if (normalized && normalized !== "null") {
        return normalized;
      }
    }
    if (value.some((entry) => normalizeJsonSchemaType(entry) === "null")) {
      return "null";
    }
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase() as JsonSchemaType;
  return JSON_SCHEMA_TYPES.has(normalized) ? normalized : undefined;
}

function normalizeEnum(value: unknown): JsonSchema["enum"] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter(
    (entry): entry is string | number | boolean =>
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
  );

  return items.length ? items : undefined;
}

/**
 * Convert Gemini Schema objects, loose JSON, or already-valid JSON Schema
 * into a provider-neutral JSON Schema.
 */
export function normalizeJsonSchema(value: unknown): JsonSchema {
  const record = asRecord(value);
  if (!record) {
    return { type: "object", properties: {}, additionalProperties: false };
  }

  const properties: Record<string, JsonSchema> = {};
  const rawProperties = asRecord(record.properties);
  if (rawProperties) {
    for (const [key, property] of Object.entries(rawProperties)) {
      properties[key] = normalizeJsonSchema(property);
    }
  }

  const type =
    normalizeJsonSchemaType(record.type) ||
    (Object.keys(properties).length || record.required ? "object" : undefined) ||
    (record.items ? "array" : "object");

  const required = Array.isArray(record.required)
    ? record.required.filter(
        (entry): entry is string =>
          typeof entry === "string" &&
          entry.trim().length > 0 &&
          (type !== "object" || entry in properties || Object.keys(properties).length === 0)
      )
    : [];

  const schema: JsonSchema = {
    type,
  };

  if (typeof record.description === "string" && record.description.trim()) {
    schema.description = record.description.trim();
  }

  if (type === "object") {
    schema.properties = properties;
    schema.required = required.filter((key) => key in properties);
    schema.additionalProperties =
      typeof record.additionalProperties === "boolean"
        ? record.additionalProperties
        : false;
  }

  if (type === "array") {
    schema.items = record.items
      ? normalizeJsonSchema(record.items)
      : { type: "string" };
  }

  const enumerated = normalizeEnum(record.enum);
  if (enumerated) {
    schema.enum = enumerated;
  }

  if (record.nullable === true) {
    schema.nullable = true;
  }

  if (typeof record.minimum === "number") {
    schema.minimum = record.minimum;
  }

  if (typeof record.maximum === "number") {
    schema.maximum = record.maximum;
  }

  return schema;
}

function jsonSchemaToPlain(
  schema: JsonSchema,
  options: { typeAsArray: boolean }
): Record<string, unknown> {
  const type = schema.type || "object";
  const result: Record<string, unknown> = {
    type: options.typeAsArray ? [type] : type,
  };

  if (schema.description) {
    result.description = schema.description;
  }

  if (type === "object") {
    const properties: Record<string, unknown> = {};
    for (const [key, property] of Object.entries(schema.properties || {})) {
      properties[key] = jsonSchemaToPlain(property, options);
    }
    result.properties = properties;
    result.required = Array.isArray(schema.required) ? schema.required : [];
    result.additionalProperties = schema.additionalProperties === true;
  }

  if (type === "array") {
    result.items = jsonSchemaToPlain(schema.items || { type: "string" }, options);
  }

  if (schema.enum?.length) {
    result.enum = schema.enum;
  }

  if (typeof schema.minimum === "number") {
    result.minimum = schema.minimum;
  }

  if (typeof schema.maximum === "number") {
    result.maximum = schema.maximum;
  }

  return result;
}

function assertValidOpenAISchema(
  schema: Record<string, unknown>,
  path: string,
  typeAsArray: boolean
) {
  const typeValue = schema.type;

  if (typeAsArray) {
    if (!Array.isArray(typeValue) || typeValue.length === 0) {
      throw new Error(`${path}/type must be a non-empty array for Groq-compatible schemas.`);
    }
  } else if (typeof typeValue !== "string") {
    throw new Error(`${path}/type must be a JSON Schema type string.`);
  }

  if (schema.properties && typeof schema.properties === "object") {
    for (const [key, property] of Object.entries(
      schema.properties as Record<string, unknown>
    )) {
      if (property && typeof property === "object") {
        assertValidOpenAISchema(
          property as Record<string, unknown>,
          `${path}/properties/${key}`,
          typeAsArray
        );
      }
    }
  }

  if (schema.items && typeof schema.items === "object") {
    assertValidOpenAISchema(
      schema.items as Record<string, unknown>,
      `${path}/items`,
      typeAsArray
    );
  }

  if ("$ref" in schema || (typeof schema.$ref === "string" && schema.$ref.includes("file://"))) {
    throw new Error(`${path} must not include URI/file schema references.`);
  }
}

export function toOpenAITool(
  tool: KwachaToolDefinition,
  options?: { typeAsArray?: boolean }
): OpenAIToolDefinition {
  const typeAsArray = options?.typeAsArray === true;
  const parameters = jsonSchemaToPlain(normalizeJsonSchema(tool.parameters), {
    typeAsArray,
  });

  assertValidOpenAISchema(parameters, "/parameters", typeAsArray);

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters,
    },
  };
}

export function toMistralTool(tool: KwachaToolDefinition): OpenAIToolDefinition {
  return toOpenAITool(tool, { typeAsArray: false });
}

function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  const type = schema.type || "object";
  const result: Record<string, unknown> = {
    type: GEMINI_TYPE[type] || Type.OBJECT,
  };

  if (schema.description) {
    result.description = schema.description;
  }

  if (type === "object") {
    const properties: Record<string, unknown> = {};
    for (const [key, property] of Object.entries(schema.properties || {})) {
      properties[key] = toGeminiSchema(property);
    }
    result.properties = properties;
    if (schema.required?.length) {
      result.required = schema.required;
    }
  }

  if (type === "array") {
    result.items = toGeminiSchema(schema.items || { type: "string" });
  }

  if (schema.enum?.length) {
    result.enum = schema.enum.map(String);
  }

  return result;
}

export function toGeminiTool(tool: KwachaToolDefinition): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parameters: toGeminiSchema(normalizeJsonSchema(tool.parameters)) as FunctionDeclaration["parameters"],
  };
}

export function validateKwachaTool(tool: KwachaToolDefinition): string[] {
  const errors: string[] = [];

  if (!tool.name?.trim()) {
    errors.push("Tool name is required.");
  }

  const schema = normalizeJsonSchema(tool.parameters);
  if (schema.type !== "object") {
    errors.push(`${tool.name} parameters.type must be "object".`);
  }

  try {
    toOpenAITool(tool, { typeAsArray: false });
    toOpenAITool(tool, { typeAsArray: true });
    toGeminiTool(tool);
  } catch (error) {
    errors.push(
      error instanceof Error ? error.message : `Invalid schema for ${tool.name}.`
    );
  }

  return errors;
}

export function logToolSchemaValidation(tools: KwachaToolDefinition[]) {
  for (const tool of tools) {
    const errors = validateKwachaTool(tool);
    if (errors.length) {
      console.error(
        `[KWACHA AI] Tool schema validation failed: ${tool.name} — ${errors.join(" ")}`
      );
    } else {
      console.log(`[KWACHA AI] Tool schema validation passed: ${tool.name}`);
    }
  }
}

export function stripUnsupportedSchemaKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUnsupportedSchemaKeys);
  }

  const record = asRecord(value);
  if (!record) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (STRIP_KEYS.has(key)) {
      continue;
    }
    if (typeof entry === "string" && entry.startsWith("file://")) {
      continue;
    }
    result[key] = stripUnsupportedSchemaKeys(entry);
  }
  return result;
}
