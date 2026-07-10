import { hasPermission } from '@pkg/domain';
import type { AppPermission, UserAccessSummary } from '@pkg/schema';
import { tool as createAiSdkTool, type ToolSet } from 'ai';

import type { AiV2Context } from './context.js';
import { createCustomerDefinition } from './tools/customers/create-customer.js';
import { findCustomersDefinition } from './tools/customers/find-customers.js';
import { getCustomerDefinition } from './tools/customers/get-customer.js';
import { patchCustomerDefinition } from './tools/customers/patch-customer.js';
import { findJobsDefinition } from './tools/jobs/find-jobs.js';
import { getJobDefinition } from './tools/jobs/get-job.js';
import { findProductsDefinition } from './tools/products/find-products.js';
import { getProductDefinition } from './tools/products/get-product.js';
import { createQuoteDefinition } from './tools/quotes/create-quote.js';
import { findQuotesDefinition } from './tools/quotes/find-quotes.js';
import { getQuoteDefinition } from './tools/quotes/get-quote.js';
import { patchQuoteDefinition } from './tools/quotes/patch-quote.js';

const V2_TOOL_DEFINITIONS = [
  findProductsDefinition,
  getProductDefinition,
  findCustomersDefinition,
  getCustomerDefinition,
  createCustomerDefinition,
  patchCustomerDefinition,
  findQuotesDefinition,
  getQuoteDefinition,
  createQuoteDefinition,
  patchQuoteDefinition,
  findJobsDefinition,
  getJobDefinition,
] as const;

export type V2AiToolName = (typeof V2_TOOL_DEFINITIONS)[number]['name'];

// V2 deliberately registers its own tools instead of inheriting the legacy registry.
export function createAiSdkTools(ctx: AiV2Context): ToolSet {
  const tools: ToolSet = {};

  for (const definition of V2_TOOL_DEFINITIONS) {
    if (!hasAnyRequiredPermission(ctx.access, definition.requiredPermission)) continue;

    tools[definition.name] = createAiSdkTool<unknown, unknown>({
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      execute: (input: unknown) => definition.handler(input, ctx),
    });
  }

  return tools;
}

function hasAnyRequiredPermission(
  access: UserAccessSummary | null,
  requiredPermission: AppPermission | readonly AppPermission[],
): boolean {
  // Arrays model existing API picker boundaries where either entity-read or quote-read grants the lookup.
  const permissions = typeof requiredPermission === 'string' ? [requiredPermission] : requiredPermission;
  return permissions.some((permission) => hasPermission(access, permission));
}
