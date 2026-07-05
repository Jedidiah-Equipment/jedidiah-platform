import * as core from '@pkg/core';
import { type AiToolBase, UserListInput, type UserListResult } from '@pkg/schema';

import type { AiContext } from '../context.js';
import { toAiToolJsonSchema } from './json-schema.js';

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
