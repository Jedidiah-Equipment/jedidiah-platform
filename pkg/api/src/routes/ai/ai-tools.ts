import { type AssistantEvent, ProductListInput } from "@pkg/schema";
import { z } from "zod";

import type { AiContext } from "./ai-context.js";
import { listProductsTool } from "./tools/list-products.js";

type AiTool = {
  description: string;
  handler: (args: unknown, ctx: AiContext) => Promise<unknown>;
  jsonSchema: Record<string, unknown>;
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
): Promise<Extract<AssistantEvent, { type: "tool_result" }>> {
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
      summary: `${name} completed successfully`,
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
