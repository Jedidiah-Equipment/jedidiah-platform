import * as core from '@pkg/core';
import { type AiToolBase, CustomerListInput, type CustomerListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListQuoteCustomersTool = AiToolBase<'listQuoteCustomers', CustomerListResult, CustomerListInput, AiContext>;

export const listQuoteCustomersTool: ListQuoteCustomersTool = {
  name: 'listQuoteCustomers',
  inputSchema: CustomerListInput,
  jsonSchema: z.toJSONSchema(CustomerListInput) as Record<string, unknown>,
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = CustomerListInput.parse(args ?? {});
    return core.listCustomers({ db: ctx.db, input });
  },
};
