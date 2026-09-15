import { listAuditActors, listAuditEvents } from '@pkg/core';
import { auditReadPermissions, hasPermission } from '@pkg/domain';
import { AuditActorsInput, AuditListInput, type Business } from '@pkg/schema';
import type { z } from 'zod';

import { createAuthTRPCError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

/**
 * One audit mechanism serves both businesses, but each business's log opens only to its own read
 * permission: the any-of gate lets either holder in, and the input's business decides which one counts.
 */
function auditReadProcedure<TInput extends z.ZodType<{ business: Business }>>(input: TInput) {
  return authorizedProcedure(Object.values(auditReadPermissions))
    .input(input)
    .use(({ ctx, input: { business }, next }) => {
      if (!hasPermission(ctx.access, auditReadPermissions[business])) {
        throw createAuthTRPCError({
          appCode: 'auth.forbidden',
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action.',
        });
      }

      return next();
    });
}

export const auditRouter = router({
  actors: auditReadProcedure(AuditActorsInput).query(({ ctx, input }) => listAuditActors({ db: ctx.db, input })),
  list: auditReadProcedure(AuditListInput).query(({ ctx, input }) => listAuditEvents({ db: ctx.db, input })),
});
