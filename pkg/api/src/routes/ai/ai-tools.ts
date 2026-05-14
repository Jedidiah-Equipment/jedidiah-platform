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
  summarizeResult?: (result: unknown) => string;
};

type ToolResult = Extract<ChatEvent, { type: "tool_result" }>;

export const aiTools = {
  [listProductsTool.name]: {
    description: listProductsTool.description,
    handler: listProductsTool.handler,
    jsonSchema: z.toJSONSchema(ProductListInput) as Record<string, unknown>,
    summarizeResult: listProductsTool.summarizeResult,
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
): Promise<Extract<ChatEvent, { type: "tool_result" }>> {
  if (!isAiToolName(name)) {
    return {
      type: "tool_result",
      name,
      ok: false,
      summary: `Unknown tool: ${name}`,
    };
  }

  try {
    const result = await aiTools[name].handler(args, ctx);

    return {
      type: "tool_result",
      name,
      ok: true,
      result,
      summary: aiTools[name].summarizeResult?.(result) ?? `${name} completed successfully`,
    };
  } catch (error) {
    return {
      type: "tool_result",
      name,
      ok: false,
      summary: error instanceof Error ? error.message : "Tool call failed",
    };
  }
}

export const openAiTools = Object.entries(aiTools).map(([name, tool]) => ({
  type: "function" as const,
  function: {
    name,
    description: tool.description,
    parameters: tool.jsonSchema,
  },
}));

export function createRunnableTools(
  ctx: AiContext,
  onToolCall: (event: Extract<ChatEvent, { type: "tool_call" }>) => void,
  onToolResult: (result: ToolResult) => void,
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
        onToolResult(result);
        return result.ok ? result.result : { error: result.summary };
      },
    },
  }));
}
