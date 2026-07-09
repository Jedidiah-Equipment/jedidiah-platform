import { z } from 'zod';

type AiToolJsonSchemaOptions = {
  io?: 'input' | 'output';
};

export function toAiToolJsonSchema(schema: z.ZodType, options: AiToolJsonSchemaOptions = {}): Record<string, unknown> {
  return closeJsonSchemaObjects(z.toJSONSchema(schema, { io: options.io ?? 'output' })) as Record<string, unknown>;
}

function closeJsonSchemaObjects(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(closeJsonSchemaObjects);
  }

  if (!isJsonSchemaObject(schema)) {
    return schema;
  }

  const closedSchema: Record<string, unknown> = { ...schema };

  if (closedSchema.type === 'object' && closedSchema.additionalProperties === undefined) {
    closedSchema.additionalProperties = false;
  }

  // OpenAI's tool-schema validator rejects regex lookaround even though JSON Schema allows it.
  if (typeof closedSchema.pattern === 'string' && hasRegexLookaround(closedSchema.pattern)) {
    delete closedSchema.pattern;
  }

  // Large format regexes duplicate the model-facing `format`; zod still validates tool inputs server-side.
  if (isRedundantFormatPattern(closedSchema) && typeof closedSchema.pattern === 'string') {
    delete closedSchema.pattern;
  }

  for (const key of ['$defs', 'properties'] as const) {
    if (isJsonSchemaObject(closedSchema[key])) {
      closedSchema[key] = Object.fromEntries(
        Object.entries(closedSchema[key]).map(([propertyName, propertySchema]) => [
          propertyName,
          closeJsonSchemaObjects(propertySchema),
        ]),
      );
    }
  }

  for (const key of ['items', 'anyOf', 'oneOf', 'allOf'] as const) {
    if (key in closedSchema) {
      closedSchema[key] = closeJsonSchemaObjects(closedSchema[key]);
    }
  }

  return closedSchema;
}

function isJsonSchemaObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasRegexLookaround(pattern: string) {
  return /\(\?(?:[=!]|<[=!])/.test(pattern);
}

function isRedundantFormatPattern(schema: Record<string, unknown>): boolean {
  return schema.format === 'uuid' || schema.format === 'date' || schema.format === 'date-time';
}
