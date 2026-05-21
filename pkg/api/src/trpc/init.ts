import { hasPermission } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
import { initTRPC } from '@trpc/server';

import type { Context } from './context.js';
import { createAuthTRPCError, getTRPCAppCode, getTRPCPublicMessage } from './errors.js';

const t = initTRPC.context<Context>().create({
  errorFormatter({ error, shape }) {
    const appCode = getTRPCAppCode(error);

    return {
      ...shape,
      message: getTRPCPublicMessage(error, shape.message),
      data: {
        ...shape.data,
        ...(appCode ? { appCode } : {}),
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw createAuthTRPCError({
      appCode: 'auth.unauthenticated',
      code: 'UNAUTHORIZED',
      message: 'Please sign in to continue.',
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

export function authorizedProcedure(permission: AppPermission | readonly AppPermission[]) {
  const permissions = Array.isArray(permission) ? permission : [permission];

  return protectedProcedure.use(({ ctx, next }) => {
    if (!ctx.access || !permissions.some((candidate) => hasPermission(ctx.access, candidate))) {
      throw createAuthTRPCError({
        appCode: 'auth.forbidden',
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
