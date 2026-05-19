import * as core from '@pkg/core';
import { type AiToolBase, CustomerListInput, type CustomerListResult } from '@pkg/schema';

import type { AiContext } from '../ai-context.js';
import { toAiToolJsonSchema } from './json-schema.js';

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
