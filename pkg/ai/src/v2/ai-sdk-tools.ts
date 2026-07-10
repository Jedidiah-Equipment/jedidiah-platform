import { hasPermission } from '@pkg/domain';
import type { AppPermission, UserAccessSummary } from '@pkg/schema';
import { tool as createAiSdkTool, type ToolSet } from 'ai';

import type { AiV2Context } from './context.js';
import { createCustomerDefinition } from './tools/customers/create-customer.js';
import { findCustomersDefinition } from './tools/customers/find-customers.js';
import { getCustomerDefinition } from './tools/customers/get-customer.js';
import { patchCustomerDefinition } from './tools/customers/patch-customer.js';
import { sendEmailDefinition } from './tools/email/send-email.js';
import { findJobsDefinition } from './tools/jobs/find-jobs.js';
import { getJobDefinition } from './tools/jobs/get-job.js';
import { findProductsDefinition } from './tools/products/find-products.js';
import { generateProductBrochureDocumentDefinition } from './tools/products/generate-product-brochure-document.js';
import { getProductDefinition } from './tools/products/get-product.js';
import { createQuoteDefinition } from './tools/quotes/create-quote.js';
import { findQuotesDefinition } from './tools/quotes/find-quotes.js';
import { generateQuoteDocumentDefinition } from './tools/quotes/generate-quote-document.js';
import { getQuoteDefinition } from './tools/quotes/get-quote.js';
import { patchQuoteDefinition } from './tools/quotes/patch-quote.js';

type PermissionedV2ToolDefinition = {
  anyOfPermissions: readonly AppPermission[];
};

const V2_TOOL_DEFINITIONS = [
  findProductsDefinition,
  getProductDefinition,
  generateProductBrochureDocumentDefinition,
  findCustomersDefinition,
  getCustomerDefinition,
  createCustomerDefinition,
  patchCustomerDefinition,
  findQuotesDefinition,
  getQuoteDefinition,
  createQuoteDefinition,
  patchQuoteDefinition,
  generateQuoteDocumentDefinition,
  sendEmailDefinition,
  findJobsDefinition,
  getJobDefinition,
] as const satisfies readonly PermissionedV2ToolDefinition[];

export type V2AiToolName = (typeof V2_TOOL_DEFINITIONS)[number]['name'];

// V2 deliberately registers its own tools instead of inheriting the legacy registry.
export function createAiSdkTools(ctx: AiV2Context): ToolSet {
  const tools: ToolSet = {};

  for (const definition of V2_TOOL_DEFINITIONS) {
    if (!hasAnyToolPermission(ctx.access, definition.anyOfPermissions)) continue;

    tools[definition.name] = createAiSdkTool<unknown, unknown>({
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      execute: (input: unknown) => definition.handler(input, ctx),
    });
  }

  return tools;
}

function hasAnyToolPermission(access: UserAccessSummary | null, anyOfPermissions: readonly AppPermission[]): boolean {
  return anyOfPermissions.some((permission) => hasPermission(access, permission));
}
