import { randomUUID } from 'node:crypto';

import { tool as createAgentTool, type Tool, type ToolInputParameters } from '@openai/agents';
import { hasPermission } from '@pkg/domain';
import type { ChatEvent, ChatToolResultSizeInfo, UserAccessSummary } from '@pkg/schema';
import type { AiContext } from './context.js';
import type { AiToolName, RegisteredAiTool } from './tool-registry.js';
import { AI_TOOL_NAMES, aiTools, projectAiToolResult } from './tool-registry.js';
import { prepareAiToolResultForModel } from './tools/projections.js';

export type AuthorizedAiTools = Partial<Record<AiToolName, RegisteredAiTool>>;
export type GetAuthorizedToolsOptions = {
  includeWriteTools?: boolean;
};
type StrictJsonObjectParameters = Extract<ToolInputParameters, { additionalProperties: false }>;
type JsonSchemaObject = Record<string, unknown>;

const SHADOWED_BY_PRIMARY: Partial<Record<AiToolName, AiToolName>> = {
  listQuoteCustomers: 'listCustomers',
  listQuoteProducts: 'listProducts',
};

type InternalToolResult =
  | {
      name: AiToolName;
      ok: true;
      result: unknown;
      size: ChatToolResultSizeInfo;
    }
  | {
      name: AiToolName;
      ok: false;
      error: string;
    };

export function getAuthorizedTools(
  access: UserAccessSummary | null,
  options: GetAuthorizedToolsOptions = {},
): AuthorizedAiTools {
  const authorizedTools: AuthorizedAiTools = {};
  const includeWriteTools = options.includeWriteTools ?? true;

  for (const name of AI_TOOL_NAMES) {
    const tool = aiTools[name];
    if (tool.kind === 'write' && !includeWriteTools) {
      continue;
    }

    if (isShadowedByAuthorizedPrimary(name, access)) {
      continue;
    }

    if (hasPermission(access, tool.requiredPermission)) {
      authorizedTools[name] = tool;
    }
  }

  return authorizedTools;
}

export function getToolSuppressedByPrimary(
  name: AiToolName,
  access: UserAccessSummary | null | undefined,
): AiToolName | null {
  const primaryName = SHADOWED_BY_PRIMARY[name];
  return primaryName && hasPermission(access, aiTools[primaryName].requiredPermission) ? primaryName : null;
}

function isShadowedByAuthorizedPrimary(name: AiToolName, access: UserAccessSummary | null | undefined): boolean {
  return getToolSuppressedByPrimary(name, access) !== null;
}

export function getAuthorizedToolNames(tools: AuthorizedAiTools): AiToolName[] {
  return getToolEntries(tools).map(([name]) => name);
}

export async function dispatchToolCall(
  tools: AuthorizedAiTools,
  name: AiToolName,
  args: unknown,
  ctx: AiContext,
): Promise<InternalToolResult> {
  const tool = tools[name];

  if (!tool) {
    return {
      error: `Unknown tool: ${name}`,
      name,
      ok: false,
    };
  }

  try {
    const result = await tool.handler(args, ctx);
    const projected = prepareAiToolResultForModel(projectAiToolResult(name, result));

    return {
      name,
      ok: true,
      result: projected.result,
      size: projected.size,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Tool call failed',
      name,
      ok: false,
    };
  }
}

export function createAgentTools(
  tools: AuthorizedAiTools,
  onToolCall: (event: Extract<ChatEvent, { type: 'tool_call' }>) => void,
  onToolResult: (event: Extract<ChatEvent, { type: 'tool_result' }>) => void,
): Tool<AiContext>[] {
  return getToolEntries(tools).map(([name, tool]) =>
    createAgentTool({
      name,
      description: tool.description,
      parameters: toStrictJsonObjectParameters(name, tool.jsonSchema),
      strict: true,
      async execute(args, runContext) {
        const ctx = runContext?.context;

        if (!ctx) {
          throw new Error('AI tool context is required.');
        }

        const id = randomUUID();
        ctx.log.ai.debug({ name, args }, 'tool call');
        onToolCall({
          id,
          name,
          args,
          type: 'tool_call',
        });
        const result = await dispatchToolCall(tools, name, args, ctx);
        const payload = result.ok ? result.result : { error: result.error };
        ctx.log.ai.debug({ name: result.name, ok: result.ok }, 'tool result');
        onToolResult({
          id,
          result: payload,
          type: 'tool_result',
          ...(result.ok ? { size: result.size } : {}),
        });
        return payload;
      },
    }),
  );
}

function getToolEntries(tools: AuthorizedAiTools): Array<[AiToolName, RegisteredAiTool]> {
  const entries: Array<[AiToolName, RegisteredAiTool]> = [];

  for (const name of AI_TOOL_NAMES) {
    const tool = tools[name];

    if (tool) {
      entries.push([name, tool]);
    }
  }

  return entries;
}

export function toStrictJsonObjectParameters(
  name: AiToolName,
  schema: Record<string, unknown>,
): StrictJsonObjectParameters {
  const issues = getStrictJsonSchemaIssues(schema, name);

  if (issues.length > 0) {
    throw new Error(`AI tool ${name} must declare a strict object JSON schema: ${issues.join('; ')}`);
  }

  return schema as StrictJsonObjectParameters;
}

function getStrictJsonSchemaIssues(schema: unknown, path: string): string[] {
  const issues: string[] = [];

  collectStrictJsonSchemaIssues(schema, path, issues);

  return issues;
}

function collectStrictJsonSchemaIssues(schema: unknown, path: string, issues: string[]): void {
  if (Array.isArray(schema)) {
    schema.forEach((item, index) => {
      collectStrictJsonSchemaIssues(item, `${path}[${index}]`, issues);
    });
    return;
  }

  if (!isJsonSchemaObject(schema)) {
    return;
  }

  if (schema.type === 'object') {
    if (schema.additionalProperties !== false) {
      issues.push(`${path} object schema must set additionalProperties: false`);
    }

    const properties = schema.properties;

    if (!isJsonSchemaObject(properties)) {
      issues.push(`${path} object schema must declare properties`);
    } else {
      for (const [propertyName, propertySchema] of Object.entries(properties)) {
        collectStrictJsonSchemaIssues(propertySchema, `${path}.properties.${propertyName}`, issues);
      }
    }
  }

  for (const compositionKey of ['$defs', 'items', 'anyOf', 'oneOf', 'allOf'] as const) {
    if (compositionKey in schema) {
      collectStrictJsonSchemaIssues(schema[compositionKey], `${path}.${compositionKey}`, issues);
    }
  }
}

function isJsonSchemaObject(value: unknown): value is JsonSchemaObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
