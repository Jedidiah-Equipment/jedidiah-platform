import { hasPermission } from '@pkg/domain';
import type { ChatEvent, UserAccessSummary } from '@pkg/schema';
import type { RunnableTools } from 'openai/lib/RunnableFunction';

import { log } from '@/logger.js';
import type { AiContext } from './ai-context.js';
import { listAuditEventsTool } from './tools/list-audit-events.js';
import { listProductsTool } from './tools/list-products.js';
import { listUsersTool } from './tools/list-users.js';
import type { AiTool } from './tools/type.js';

export const AI_TOOL_NAMES = [listProductsTool.name, listAuditEventsTool.name, listUsersTool.name] as const;
export type AiToolName = (typeof AI_TOOL_NAMES)[number];

type AiToolMap = Record<AiToolName, AiTool>;
export type AuthorizedAiTools = Partial<AiToolMap>;

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

type RunnableTool = RunnableTools<readonly object[]>[number];

export const aiTools: AiToolMap = {
  [listAuditEventsTool.name]: listAuditEventsTool,
  [listProductsTool.name]: listProductsTool,
  [listUsersTool.name]: listUsersTool,
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
      result,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Tool call failed',
      name,
      ok: false,
    };
  }
}

export function createRunnableTools(
  tools: AuthorizedAiTools,
  ctx: AiContext,
  onToolCall: (event: Extract<ChatEvent, { type: 'tool_call' }>) => void,
): RunnableTool[] {
  return getToolEntries(tools).map(([name, tool]) => ({
    type: 'function' as const,
    function: {
      name,
      description: tool.description,
      parameters: tool.jsonSchema,
      parse: JSON.parse,
      function: async (args: unknown) => {
        log.ai.debug({ name, args }, 'tool call');
        onToolCall({
          type: 'tool_call',
          name,
          args,
        });
        const result = await dispatchToolCall(tools, name, args, ctx);
        log.ai.debug({ name: result.name, ok: result.ok }, 'tool result');
        return result.ok ? result.result : { error: result.error };
      },
    },
  }));
}

function getToolEntries(tools: AuthorizedAiTools): Array<[AiToolName, AiTool]> {
  const entries: Array<[AiToolName, AiTool]> = [];

  for (const name of AI_TOOL_NAMES) {
    const tool = tools[name];

    if (tool) {
      entries.push([name, tool]);
    }
  }

  return entries;
}
