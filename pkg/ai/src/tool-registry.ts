import type { AiToolDefinition, AnyAiTool, AiToolKind as RegisteredAiToolKind } from './tool-definition.js';
import { createToolDescription } from './tool-description.js';
import { listAuditEventsDefinition } from './tools/audit/list-audit-events.js';
import { createCustomerDefinition } from './tools/customers/create-customer.js';
import { getCustomerDefinition } from './tools/customers/get-customer.js';
import { listCustomersDefinition } from './tools/customers/list-customers.js';
import { getJobDefinition } from './tools/jobs/get-job.js';
import { listJobsDefinition } from './tools/jobs/list-jobs.js';
import { getPartDefinition } from './tools/parts/get-part.js';
import { listPartsDefinition } from './tools/parts/list-parts.js';
import { getProductDefinition } from './tools/products/get-product.js';
import { listProductsDefinition } from './tools/products/list-products.js';
import { createQuoteDefinition } from './tools/quotes/create-quote.js';
import { getQuoteDefinition } from './tools/quotes/get-quote.js';
import { listQuoteCustomersDefinition } from './tools/quotes/list-quote-customers.js';
import { listQuoteProductsDefinition } from './tools/quotes/list-quote-products.js';
import { listQuoteSalespeopleDefinition } from './tools/quotes/list-quote-salespeople.js';
import { listQuotesDefinition } from './tools/quotes/list-quotes.js';
import { sendDraftQuoteEmailDefinition } from './tools/quotes/send-draft-quote-email.js';
import { listUsersDefinition } from './tools/users/list-users.js';

export type { AiToolKind } from './tool-definition.js';
export { createToolDescription } from './tool-description.js';

type AiToolNames<TRegistry extends readonly AiToolDefinition[]> = {
  readonly [Index in keyof TRegistry]: TRegistry[Index] extends AiToolDefinition<infer TTool> ? TTool['name'] : never;
};

// biome-ignore format: keep the stable-order list compact; order is asserted in tool-registry.test.ts.
export const AI_TOOL_REGISTRY = [
  listProductsDefinition, getProductDefinition, listPartsDefinition, getPartDefinition,
  listCustomersDefinition, getCustomerDefinition, createCustomerDefinition,
  listJobsDefinition, getJobDefinition, listQuotesDefinition, getQuoteDefinition,
  createQuoteDefinition, sendDraftQuoteEmailDefinition,
  listQuoteCustomersDefinition, listQuoteProductsDefinition, listQuoteSalespeopleDefinition,
  listAuditEventsDefinition, listUsersDefinition,
] as const;

export type AiTool = (typeof AI_TOOL_REGISTRY)[number]['tool'];
export type AiToolName = AiTool['name'];
export type AiToolDescriptor = AiToolDefinition['descriptor'] & { name: AiToolName };
export type RegisteredAiTool<TTool extends AnyAiTool = AiTool> = TTool & {
  description: string;
  kind: RegisteredAiToolKind;
};
export type AiToolMap = {
  [Name in AiToolName]: RegisteredAiTool<Extract<AiTool, { name: Name }>>;
};

export const AI_TOOL_NAMES = AI_TOOL_REGISTRY.map((record) => record.tool.name) as unknown as AiToolNames<
  typeof AI_TOOL_REGISTRY
>;
export const AI_WRITE_TOOL_NAMES: ReadonlySet<AiToolName> = new Set(
  AI_TOOL_REGISTRY.filter((record) => record.kind === 'write').map((record) => record.tool.name as AiToolName),
);
export const aiToolDescriptors = Object.fromEntries(
  AI_TOOL_REGISTRY.map((record) => [record.tool.name, { ...record.descriptor, name: record.tool.name }]),
) as Record<AiToolName, AiToolDescriptor>;
export const aiTools = Object.fromEntries(
  AI_TOOL_REGISTRY.map((record) => [
    record.tool.name,
    {
      ...record.tool,
      description: createToolDescription(aiToolDescriptors[record.tool.name]),
      kind: record.kind,
    },
  ]),
) as AiToolMap;

const aiToolResultProjectors = Object.fromEntries(
  AI_TOOL_REGISTRY.map((record) => [record.tool.name, record.projectResult as (result: unknown) => unknown]),
) as Record<AiToolName, (result: unknown) => unknown>;

export function projectAiToolResult(name: AiToolName, result: unknown): unknown {
  return aiToolResultProjectors[name](result);
}
