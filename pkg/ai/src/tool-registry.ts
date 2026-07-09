import type { AiToolDefinition, AnyAiTool, AiToolKind as RegisteredAiToolKind } from './tool-definition.js';
import { createToolDescription } from './tool-description.js';
import { listAuditEventsDefinition } from './tools/audit/list-audit-events.js';
import { createCustomerDefinition } from './tools/customers/create-customer.js';
import { getCustomerDefinition } from './tools/customers/get-customer.js';
import { listCustomersDefinition } from './tools/customers/list-customers.js';
import { updateCustomerDefinition } from './tools/customers/update-customer.js';
import { listProductDocumentsDefinition } from './tools/documents/list-product-documents.js';
import { listQuoteDocumentsDefinition } from './tools/documents/list-quote-documents.js';
import { listFeedbackDefinition } from './tools/feedback/list-feedback.js';
import { listJobFeedbackDefinition } from './tools/feedback/list-job-feedback.js';
import { submitFeedbackDefinition } from './tools/feedback/submit-feedback.js';
import { createJobFromQuoteDefinition } from './tools/jobs/create-job-from-quote.js';
import { getJobDefinition } from './tools/jobs/get-job.js';
import { listBayScheduleDefinition } from './tools/jobs/list-bay-schedule.js';
import { listJobsDefinition } from './tools/jobs/list-jobs.js';
import { getPartDefinition } from './tools/parts/get-part.js';
import { listPartsDefinition } from './tools/parts/list-parts.js';
import { getProductDefinition } from './tools/products/get-product.js';
import { listProductsDefinition } from './tools/products/list-products.js';
import { createQuoteDefinition } from './tools/quotes/create-quote.js';
import { getQuoteDefinition } from './tools/quotes/get-quote.js';
import { getQuoteProductBayAvailabilityDefinition } from './tools/quotes/get-quote-product-bay-availability.js';
import { listQuoteCustomersDefinition } from './tools/quotes/list-quote-customers.js';
import { listQuoteProductsDefinition } from './tools/quotes/list-quote-products.js';
import { listQuoteSalespeopleDefinition } from './tools/quotes/list-quote-salespeople.js';
import { listQuotesDefinition } from './tools/quotes/list-quotes.js';
import { listStaleSentQuotesDefinition } from './tools/quotes/list-stale-sent-quotes.js';
import { listUpcomingDeliveryQuotesDefinition } from './tools/quotes/list-upcoming-delivery-quotes.js';
import { sendDraftQuoteEmailDefinition } from './tools/quotes/send-draft-quote-email.js';
import { summarizeQuotePipelineDefinition } from './tools/quotes/summarize-quote-pipeline.js';
import { summarizeQuoteWeeklyFlowDefinition } from './tools/quotes/summarize-quote-weekly-flow.js';
import { summarizeQuotesByStatusDefinition } from './tools/quotes/summarize-quotes-by-status.js';
import { updateQuoteDefinition } from './tools/quotes/update-quote.js';
import { getSupplierDefinition } from './tools/suppliers/get-supplier.js';
import { listSuppliersDefinition } from './tools/suppliers/list-suppliers.js';
import { listUsersDefinition } from './tools/users/list-users.js';

export type { AiToolKind } from './tool-definition.js';
export { createToolDescription } from './tool-description.js';

// biome-ignore format: keep the stable-order list compact; order is asserted in tool-registry.test.ts.
export const AI_TOOL_REGISTRY = [
  listProductsDefinition, getProductDefinition, listProductDocumentsDefinition,
  listPartsDefinition, getPartDefinition,
  listCustomersDefinition, getCustomerDefinition, createCustomerDefinition, updateCustomerDefinition,
  listJobsDefinition, getJobDefinition, listBayScheduleDefinition, listJobFeedbackDefinition,
  createJobFromQuoteDefinition,
  listQuotesDefinition, getQuoteDefinition, createQuoteDefinition, updateQuoteDefinition,
  sendDraftQuoteEmailDefinition,
  listStaleSentQuotesDefinition, listUpcomingDeliveryQuotesDefinition,
  summarizeQuotesByStatusDefinition, summarizeQuotePipelineDefinition, summarizeQuoteWeeklyFlowDefinition,
  getQuoteProductBayAvailabilityDefinition, listQuoteDocumentsDefinition,
  listQuoteCustomersDefinition, listQuoteProductsDefinition, listQuoteSalespeopleDefinition,
  listSuppliersDefinition, getSupplierDefinition,
  listFeedbackDefinition, submitFeedbackDefinition,
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

export const AI_TOOL_NAMES: readonly AiToolName[] = AI_TOOL_REGISTRY.map((record) => record.tool.name);
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
