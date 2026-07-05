import * as core from '@pkg/core';
import { type AiToolBase, CustomerListInput, type CustomerListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectCustomer, projectPagedItems } from '../projections.js';

export type ListCustomersTool = AiToolBase<'listCustomers', CustomerListResult, CustomerListInput, AiContext>;

export const listCustomersTool: ListCustomersTool = {
  name: 'listCustomers',
  inputSchema: CustomerListInput,
  jsonSchema: toAiToolJsonSchema(CustomerListInput),
  requiredPermission: 'customer:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = CustomerListInput.parse(args ?? {});
    return core.listCustomers({ db: ctx.db, input });
  },
};

export const listCustomersDefinition: AiToolDefinition<ListCustomersTool> = {
  kind: 'read',
  tool: listCustomersTool,
  descriptor: {
    purpose: 'List Customers visible to Customer readers.',
    useWhen: ['Searching by Customer company name, email, VAT number, UUID, or partial text.'],
    doNotUseWhen: ['The caller only has quote access; use listQuoteCustomers for quote-reader Customer lookup.'],
    searchableIdentifiers: ['Customer UUID', 'company name', 'email', 'VAT number'],
    resultIdentifiers: ['Customer company name', 'Customer UUID', 'VAT number'],
    linkTarget: aiLinkMetadata.Customer,
  },
  projectResult: (result) => projectPagedItems(result, projectCustomer),
};
