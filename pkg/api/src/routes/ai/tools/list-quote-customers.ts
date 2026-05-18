import * as core from '@pkg/core';
import { type AiToolBase, CustomerListInput, type CustomerListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListQuoteCustomersTool = AiToolBase<'listQuoteCustomers', CustomerListResult, CustomerListInput, AiContext>;

export const listQuoteCustomersTool: ListQuoteCustomersTool = {
  name: 'listQuoteCustomers',
  description:
    'List customers available to quote readers. Prefer specific queries over broad directory scans: use columnFilters.id when a customer id is known, columnFilters.companyName for a company name, and columnFilters.email for an email address. Use search for exploratory text matches across customer id, company name, and email. Use sortBy, sortDirection, page, and pageSize to return the right customer slice.',
  inputSchema: CustomerListInput,
  jsonSchema: z.toJSONSchema(CustomerListInput) as Record<string, unknown>,
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = CustomerListInput.parse(args ?? {});
    return core.listCustomers({ db: ctx.db, input });
  },
};
