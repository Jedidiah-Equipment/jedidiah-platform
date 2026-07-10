import { hasPermission } from '@pkg/domain';
import { tool as createAiSdkTool, type ToolSet } from 'ai';

import type { AiV2Context } from './context.js';
import { findProductsDefinition } from './tools/products/find-products.js';
import { getProductDefinition } from './tools/products/get-product.js';

const V2_TOOL_DEFINITIONS = [findProductsDefinition, getProductDefinition] as const;

export type V2AiToolName = (typeof V2_TOOL_DEFINITIONS)[number]['name'];

// V2 deliberately registers its own tools instead of inheriting the legacy registry.
export function createAiSdkTools(ctx: AiV2Context): ToolSet {
  const tools: ToolSet = {};

  for (const definition of V2_TOOL_DEFINITIONS) {
    if (!hasPermission(ctx.access, definition.requiredPermission)) continue;

    tools[definition.name] = createAiSdkTool<unknown, unknown>({
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      execute: (input: unknown) => definition.handler(input, ctx),
    });
  }

  return tools;
}
