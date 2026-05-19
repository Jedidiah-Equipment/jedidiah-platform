import { randomUUID } from 'node:crypto';

import { tool as createAgentTool, type Tool, type ToolInputParameters } from '@openai/agents';
import { hasPermission } from '@pkg/domain';
import type { ChatEvent, UserAccessSummary } from '@pkg/schema';

import { log } from '@/logger.js';
import type { AiContext } from './ai-context.js';
import { projectAiToolResult } from './ai-result-projections.js';
import { aiToolDescriptors, createToolDescription } from './ai-tool-descriptors.js';
import { getCustomerTool } from './tools/get-customer.js';
import { getJobTool } from './tools/get-job.js';
import { getProductTool } from './tools/get-product.js';
import { getQuoteTool } from './tools/get-quote.js';
import { listAuditEventsTool } from './tools/list-audit-events.js';
import { listCustomersTool } from './tools/list-customers.js';
import { listJobsTool } from './tools/list-jobs.js';
import { listProductsTool } from './tools/list-products.js';
import { listQuoteCustomersTool } from './tools/list-quote-customers.js';
import { listQuoteProductsTool } from './tools/list-quote-products.js';
import { listQuoteSalespeopleTool } from './tools/list-quote-salespeople.js';
import { listQuotesTool } from './tools/list-quotes.js';
import { listUsersTool } from './tools/list-users.js';
import type { AiTool } from './tools/type.js';

export const AI_TOOL_NAMES = [
  listProductsTool.name,
  getProductTool.name,
  listCustomersTool.name,
  getCustomerTool.name,
  listJobsTool.name,
  getJobTool.name,
  listQuotesTool.name,
  getQuoteTool.name,
  listQuoteCustomersTool.name,
  listQuoteProductsTool.name,
  listQuoteSalespeopleTool.name,
  listAuditEventsTool.name,
  listUsersTool.name,
] as const;
export type AiToolName = (typeof AI_TOOL_NAMES)[number];

type RegisteredAiTool = AiTool & {
  description: string;
};

type AiToolMap = Record<AiToolName, RegisteredAiTool>;
export type AuthorizedAiTools = Partial<AiToolMap>;
type StrictJsonObjectParameters = Extract<ToolInputParameters, { additionalProperties: false }>;
type JsonSchemaObject = Record<string, unknown>;

type InternalToolResult =
  | {
      name: AiToolName;
      ok: true;
      result: unknown;
    }
  | {
      name: AiToolName;
      ok: false;
      error: string;
    };

export const aiTools: AiToolMap = {
  [getCustomerTool.name]: withGeneratedDescription(getCustomerTool),
  [getJobTool.name]: withGeneratedDescription(getJobTool),
  [getProductTool.name]: withGeneratedDescription(getProductTool),
  [getQuoteTool.name]: withGeneratedDescription(getQuoteTool),
  [listAuditEventsTool.name]: withGeneratedDescription(listAuditEventsTool),
  [listCustomersTool.name]: withGeneratedDescription(listCustomersTool),
  [listJobsTool.name]: withGeneratedDescription(listJobsTool),
  [listProductsTool.name]: withGeneratedDescription(listProductsTool),
  [listQuoteCustomersTool.name]: withGeneratedDescription(listQuoteCustomersTool),
  [listQuoteProductsTool.name]: withGeneratedDescription(listQuoteProductsTool),
  [listQuoteSalespeopleTool.name]: withGeneratedDescription(listQuoteSalespeopleTool),
  [listQuotesTool.name]: withGeneratedDescription(listQuotesTool),
  [listUsersTool.name]: withGeneratedDescription(listUsersTool),
};

export function getAuthorizedTools(access: UserAccessSummary | null): AuthorizedAiTools {
  const authorizedTools: AuthorizedAiTools = {};

  for (const name of AI_TOOL_NAMES) {
    const tool = aiTools[name];
    if (hasPermission(access, tool.requiredPermission)) {
      authorizedTools[name] = tool;
    }
  }

  return authorizedTools;
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

    return {
      name,
      ok: true,
      result: projectAiToolResult(name, result),
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
        log.ai.debug({ name, args }, 'tool call');
        onToolCall({
          id,
          name,
          args,
          type: 'tool_call',
        });
        const result = await dispatchToolCall(tools, name, args, ctx);
        const payload = result.ok ? result.result : { error: result.error };
        log.ai.debug({ name: result.name, ok: result.ok }, 'tool result');
        onToolResult({
          id,
          result: payload,
          type: 'tool_result',
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

function withGeneratedDescription<TTool extends AiTool>(tool: TTool): TTool & { description: string } {
  return {
    ...tool,
    description: createToolDescription(aiToolDescriptors[tool.name]),
  };
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
