import * as core from '@pkg/core';
import type { AiToolBase, UserListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

const ListQuoteSalespeopleInput = z.strictObject({});

type ListQuoteSalespeopleInput = z.infer<typeof ListQuoteSalespeopleInput>;

export type ListQuoteSalespeopleTool = AiToolBase<
  'listQuoteSalespeople',
  UserListResult,
  ListQuoteSalespeopleInput,
  AiContext
>;

export const listQuoteSalespeopleTool: ListQuoteSalespeopleTool = {
  name: 'listQuoteSalespeople',
  description:
    'List users who can be assigned as quote salespeople. This tool does not accept filters, sorting, or paging, so use it only when the user needs the salesperson roster or needs to identify a salesperson id for a quote-related follow-up.',
  inputSchema: ListQuoteSalespeopleInput,
  jsonSchema: z.toJSONSchema(ListQuoteSalespeopleInput) as Record<string, unknown>,
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    ListQuoteSalespeopleInput.parse(args ?? {});
    return core.listQuoteSalespeople({ db: ctx.db });
  },
};
