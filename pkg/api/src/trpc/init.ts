import { hasBusinessAccess, hasPermission } from '@pkg/domain';
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

type Business = 'contracting' | 'equipment';

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
      session: ctx.session,
    },
  });
});

export function businessProcedure(business: Business) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!hasBusinessAccess(ctx.access, business)) {
      throw createAuthTRPCError({
        appCode: 'auth.forbidden',
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      });
    }

    return next({ ctx: { access: ctx.access } });
  });
}

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
        access: ctx.access,
      },
    });
  });
}

/**
 * Every permission, where {@link authorizedProcedure} takes any one of them. For a read that
 * composes facts several gates own separately: a caller holding one of them is not thereby entitled
 * to the rest, and an any-of gate on such a read hands a role data it can reach nowhere else.
 */
export function fullyAuthorizedProcedure(permissions: readonly AppPermission[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!ctx.access || !permissions.every((candidate) => hasPermission(ctx.access, candidate))) {
      throw createAuthTRPCError({
        appCode: 'auth.forbidden',
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      });
    }

    return next({
      ctx: {
        access: ctx.access,
      },
    });
  });
}
