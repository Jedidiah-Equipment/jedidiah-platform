import * as core from '@pkg/core';
import { type AiToolBase, CustomerListInput, type CustomerListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectCustomerListItem, projectPagedItems } from '../projections.js';

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
    useWhen: ['Searching Customers by free text.'],
    searchableIdentifiers: ['Customer company name', 'email', 'VAT number', 'Customer UUID'],
    resultIdentifiers: ['Customer company name', 'Customer UUID', 'VAT number'],
    linkTarget: aiLinkMetadata.Customer,
  },
  projectResult: (result) => projectPagedItems(result, projectCustomerListItem),
};
