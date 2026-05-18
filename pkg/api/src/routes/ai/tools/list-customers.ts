import * as core from '@pkg/core';
import { type AiToolBase, CustomerListInput, type CustomerListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListCustomersTool = AiToolBase<'listCustomers', CustomerListResult, CustomerListInput, AiContext>;

export const listCustomersTool: ListCustomersTool = {
  name: 'listCustomers',
  inputSchema: CustomerListInput,
  jsonSchema: z.toJSONSchema(CustomerListInput) as Record<string, unknown>,
  requiredPermission: 'customer:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = CustomerListInput.parse(args ?? {});
    return core.listCustomers({ db: ctx.db, input });
  },
};
