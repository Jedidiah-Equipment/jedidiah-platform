import * as core from '@pkg/core';
import { type AiToolBase, CustomerListInput, type CustomerListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectCustomer, projectPagedItems } from '../projections.js';

export type ListQuoteCustomersTool = AiToolBase<'listQuoteCustomers', CustomerListResult, CustomerListInput, AiContext>;

export const listQuoteCustomersTool: ListQuoteCustomersTool = {
  name: 'listQuoteCustomers',
  inputSchema: CustomerListInput,
  jsonSchema: toAiToolJsonSchema(CustomerListInput),
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = CustomerListInput.parse(args ?? {});
    return core.listCustomers({ db: ctx.db, input });
  },
};

export const listQuoteCustomersDefinition: AiToolDefinition<ListQuoteCustomersTool> = {
  kind: 'read',
  tool: listQuoteCustomersTool,
  descriptor: {
    purpose: 'List Customers available to Quote readers.',
    useWhen: ['A quote-reader needs to find a Customer by company name, email, VAT number, UUID, or partial text.'],
    doNotUseWhen: ['The user needs Customer-only permissions or non-Quote Customer workflows.'],
    searchableIdentifiers: ['Customer UUID', 'company name', 'email', 'VAT number'],
    resultIdentifiers: ['Customer company name', 'Customer UUID', 'VAT number'],
    linkTarget: aiLinkMetadata.Customer,
  },
  projectResult: (result) => projectPagedItems(result, projectCustomer),
};
