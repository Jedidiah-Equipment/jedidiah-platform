import * as core from '@pkg/core';
import { type AiToolBase, UserListInput, type UserListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListUsersTool = AiToolBase<'listUsers', UserListResult, UserListInput, AiContext>;

export const listUsersTool: ListUsersTool = {
  name: 'listUsers',
  description:
    'List all users as safe summaries: id, name, email, emailVerified, and role. This tool does not accept filters, sorting, or paging, so use it only when the user needs the user roster or needs to identify a user id for a more specific follow-up query.',
  inputSchema: UserListInput,
  jsonSchema: z.toJSONSchema(UserListInput) as Record<string, unknown>,
  requiredPermission: 'user:list',
  async handler(args: unknown, ctx: AiContext) {
    UserListInput.parse(args ?? {});
    return core.listUsers({ db: ctx.db });
  },
};
