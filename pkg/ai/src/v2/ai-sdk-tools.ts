import { hasPermission } from '@pkg/domain';
import { tool as createAiSdkTool, type Tool, type ToolSet } from 'ai';

import type { AiV2Context } from './context.js';
import { prepareToolResult } from './tool-result.js';
import { listProductsDefinition } from './tools/products/list-products.js';

export type V2AiToolName = typeof listProductsDefinition.name;

export type CreateAiSdkToolsOptions = {
  // Restrict the exposed set to these tool names (still intersected with the caller's authorization).
  include?: readonly V2AiToolName[];
};

// V2 deliberately registers its own copied tools instead of reading the legacy registry. Keeping
// the authorization, projection, and result budget here makes the complete v2 surface visible in
// this folder while preserving the established tool boundary behavior.
export function createAiSdkTools(ctx: AiV2Context, options: CreateAiSdkToolsOptions = {}): ToolSet {
  const tool = listProductsDefinition;

  if (options.include && !options.include.includes(tool.name)) {
    return {};
  }

  const isAuthorized =
    tool.requiredPermission === null ? ctx.access !== null : hasPermission(ctx.access, tool.requiredPermission);

  if (!isAuthorized) {
    return {};
  }

  return {
    [tool.name]: createAiSdkTool({
      description: tool.description,
      inputSchema: tool.inputSchema,
      async execute(input) {
        try {
          const result = await tool.handler(input, ctx);
          return prepareToolResult(tool.projectResult(result));
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Tool call failed' };
        }
      },
    }) as Tool,
  };
}
