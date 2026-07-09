import type { z } from 'zod';

import type { AppPermission } from '../auth/authorization.js';
import type { AiContext } from './context.js';

export type AiToolBase<TName extends string, TResult, TInput, TContext extends AiContext> = {
  name: TName;
  handler: (args: unknown, ctx: TContext) => Promise<TResult>;
  inputSchema: z.ZodType<TInput>;
  jsonSchema: Record<string, unknown>;
  // `null` marks a session-only gate: any authenticated caller is authorized, with no permission
  // check. Used by tools whose API route is `protectedProcedure` rather than permission-gated.
  requiredPermission: AppPermission | null;
};
