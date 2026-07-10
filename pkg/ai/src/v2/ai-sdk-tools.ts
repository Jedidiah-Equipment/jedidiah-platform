import { hasPermission } from '@pkg/domain';
import { tool as createAiSdkTool, type ToolSet } from 'ai';

import type { AiV2Context } from './context.js';
import { listProductsDefinition } from './tools/products/list-products.js';

export type V2AiToolName = typeof listProductsDefinition.name;

export type CreateAiSdkToolsOptions = {
  // Restrict the exposed set to these tool names (still intersected with the caller's authorization).
  include?: readonly V2AiToolName[];
};

// V2 deliberately registers its own tools instead of inheriting the legacy registry.
export function createAiSdkTools(ctx: AiV2Context, options: CreateAiSdkToolsOptions = {}): ToolSet {
  const tool = listProductsDefinition;

  if (options.include && !options.include.includes(tool.name)) {
    return {};
  }

  if (!hasPermission(ctx.access, tool.requiredPermission)) {
    return {};
  }

  return {
    [tool.name]: createAiSdkTool({
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      execute: (input) => tool.handler(input, ctx),
    }),
  };
}
