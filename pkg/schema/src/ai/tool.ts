import type { z } from 'zod';

import type { AppPermission } from '../auth/authorization.js';
import type { AiContext } from './context.js';

export type AiToolBase<TName extends string, TResult, TInput, TContext extends AiContext> = {
  name: TName;
  description: string;
  handler: (args: unknown, ctx: TContext) => Promise<TResult>;
  inputSchema: z.ZodType<TInput>;
  jsonSchema: Record<string, unknown>;
  requiredPermission: AppPermission;
};
