import { hasPermission } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
import { initTRPC, TRPCError } from '@trpc/server';

import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

export function authorizedProcedure(permission: AppPermission) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!ctx.access || !hasPermission(ctx.access, permission)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      });
    }

    return next({
      ctx: {
        ...ctx,
        access: ctx.access,
      },
    });
  });
}
