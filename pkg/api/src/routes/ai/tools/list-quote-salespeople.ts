import * as core from '@pkg/core';
import { type AiToolBase, UserListInput, type UserListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListQuoteSalespeopleTool = AiToolBase<'listQuoteSalespeople', UserListResult, UserListInput, AiContext>;

export const listQuoteSalespeopleTool: ListQuoteSalespeopleTool = {
  name: 'listQuoteSalespeople',
  description:
    'List users who can be assigned as quote salespeople. This tool does not accept filters, sorting, or paging, so use it only when the user needs the salesperson roster or needs to identify a salesperson id for a quote-related follow-up.',
  inputSchema: UserListInput,
  jsonSchema: z.toJSONSchema(UserListInput) as Record<string, unknown>,
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    UserListInput.parse(args ?? {});
    return core.listQuoteSalespeople({ db: ctx.db });
  },
};
