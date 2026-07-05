import * as core from '@pkg/core';
import type { AiToolBase, UserListResult } from '@pkg/schema';
import { z } from 'zod';
import { toAiToolJsonSchema } from '../json-schema.js';
import { identityProjection } from '../projections.js';
import type { AiContext, AiToolDefinition } from '../tool-support.js';

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

export const listQuoteSalespeopleDefinition: AiToolDefinition<ListQuoteSalespeopleTool> = {
  kind: 'read',
  tool: listQuoteSalespeopleTool,
  descriptor: {
    purpose: 'List Users who can be assigned as Quote Salespeople.',
    useWhen: ['The user needs the salesperson roster or needs to identify a salesperson id for a Quote follow-up.'],
    doNotUseWhen: ['Searching, sorting, or paging Users; this tool intentionally accepts no filters.'],
    searchableIdentifiers: ['none'],
    resultIdentifiers: ['User name', 'User email', 'User UUID'],
  },
  projectResult: identityProjection,
};
