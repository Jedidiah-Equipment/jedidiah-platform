import * as core from '@pkg/core';
import type { AiToolBase, UserListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../context.js';
import { toAiToolJsonSchema } from './json-schema.js';

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
  inputSchema: ListQuoteSalespeopleInput,
  jsonSchema: {
    ...toAiToolJsonSchema(ListQuoteSalespeopleInput),
    required: [],
  },
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    ListQuoteSalespeopleInput.parse(args ?? {});
    return core.listQuoteSalespeople({ db: ctx.db });
  },
};
