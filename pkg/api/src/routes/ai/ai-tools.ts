import { type ChatEvent, ProductListInput } from "@pkg/schema";
import { z } from "zod";

import { createLogger } from "@/logger.js";
import type { AiContext } from "./ai-context.js";

const log = createLogger("ai");

import { listProductsTool } from "./tools/list-products.js";

type AiTool = {
  description: string;
  handler: (args: unknown, ctx: AiContext) => Promise<unknown>;
  jsonSchema: Record<string, unknown>;
};

type InternalToolResult =
  | {
      name: string;
      ok: true;
      result: unknown;
    }
  | {
      error: string;
      name: string;
      ok: false;
    };

export const aiTools = {
  [listProductsTool.name]: {
    description: listProductsTool.description,
    handler: listProductsTool.handler,
    jsonSchema: z.toJSONSchema(ProductListInput) as Record<string, unknown>,
  },
} satisfies Record<string, AiTool>;

export type AiToolName = keyof typeof aiTools;

export function isAiToolName(name: string): name is AiToolName {
  return name in aiTools;
}

export async function dispatchToolCall(
  name: string,
  args: unknown,
  ctx: AiContext,
): Promise<InternalToolResult> {
  if (!isAiToolName(name)) {
    return {
      error: `Unknown tool: ${name}`,
      name,
      ok: false,
    };
  }

  try {
    const result = await aiTools[name].handler(args, ctx);

    return {
      name,
      ok: true,
      result,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Tool call failed",
      name,
      ok: false,
    };
  }
}

export function createRunnableTools(
  ctx: AiContext,
  onToolCall: (event: Extract<ChatEvent, { type: "tool_call" }>) => void,
) {
  return Object.entries(aiTools).map(([name, tool]) => ({
    type: "function" as const,
    function: {
      name,
      description: tool.description,
      parameters: tool.jsonSchema,
      parse: JSON.parse,
      function: async (args: unknown) => {
        log.debug({ name, args }, "tool call");
        onToolCall({
          args,
          name,
          type: "tool_call",
        });
        const result = await dispatchToolCall(name, args, ctx);
        log.debug({ name: result.name, ok: result.ok }, "tool result");
        return result.ok ? result.result : { error: result.error };
      },
    },
  }));
}
