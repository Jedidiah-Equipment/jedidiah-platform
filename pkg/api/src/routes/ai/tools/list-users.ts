import * as core from '@pkg/core';
import { type AiToolBase, UserListInput, type UserListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListUsersTool = AiToolBase<'listUsers', UserListResult, UserListInput, AiContext>;

export const listUsersTool: ListUsersTool = {
  name: 'listUsers',
  description: 'List users with the same safe summary fields available in the users page.',
  inputSchema: UserListInput,
  jsonSchema: z.toJSONSchema(UserListInput) as Record<string, unknown>,
  requiredPermission: 'user:list',
  async handler(args: unknown, ctx: AiContext) {
    UserListInput.parse(args ?? {});
    return core.listUsers(ctx.db);
  },
};
