import * as core from '@pkg/core';
import { type AiToolBase, UserListInput, type UserListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectUserList } from '../projections.js';

export type ListUsersTool = AiToolBase<'listUsers', UserListResult, UserListInput, AiContext>;

export const listUsersTool: ListUsersTool = {
  name: 'listUsers',
  inputSchema: UserListInput,
  jsonSchema: toAiToolJsonSchema(UserListInput),
  requiredPermission: 'user:list',
  async handler(args: unknown, ctx: AiContext) {
    UserListInput.parse(args ?? {});
    return core.listUsers({ db: ctx.db });
  },
};

export const listUsersDefinition: AiToolDefinition<ListUsersTool> = {
  kind: 'read',
  tool: listUsersTool,
  descriptor: {
    purpose: 'List all Users as safe summaries.',
    useWhen: ['The user needs the User roster or needs to identify a User id for a more specific follow-up query.'],
    doNotUseWhen: ['Searching, sorting, or paging Users; this tool intentionally accepts no filters.'],
    resultIdentifiers: ['User name', 'User email', 'User UUID', 'App Role'],
  },
  projectResult: projectUserList,
};
