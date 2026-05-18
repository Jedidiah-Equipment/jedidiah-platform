import * as core from '@pkg/core';
import { type AiToolBase, CustomerListInput, type CustomerListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListCustomersTool = AiToolBase<'listCustomers', CustomerListResult, CustomerListInput, AiContext>;

export const listCustomersTool: ListCustomersTool = {
  name: 'listCustomers',
  description:
    'List customers. Prefer specific queries over broad directory scans: use columnFilters.id when a customer id is known, columnFilters.companyName for a company name, and columnFilters.email for an email address. Use search for exploratory text matches across customer id, company name, and email. Use sortBy, sortDirection, page, and pageSize to return the right customer slice.',
  inputSchema: CustomerListInput,
  jsonSchema: z.toJSONSchema(CustomerListInput) as Record<string, unknown>,
  requiredPermission: 'customer:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = CustomerListInput.parse(args ?? {});
    return core.listCustomers({ db: ctx.db, input });
  },
};
