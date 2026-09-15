import { listAuditActors, listAuditEvents } from '@pkg/core';
import { auditReadPermissions } from '@pkg/domain';
import { AuditActorsInput, AuditListInput, type Business } from '@pkg/schema';
import type { z } from 'zod';

import { protectedProcedure, requirePermission, router } from '../../trpc/init.js';

/** One audit mechanism serves both businesses; the input's business decides which read permission opens it. */
function auditReadProcedure<TInput extends z.ZodType<{ business: Business }>>(input: TInput) {
  return protectedProcedure.input(input).use(({ ctx, input: { business }, next }) => {
    requirePermission(ctx.access, auditReadPermissions[business]);

    return next();
  });
}

export const auditRouter = router({
  actors: auditReadProcedure(AuditActorsInput).query(({ ctx, input }) => listAuditActors({ db: ctx.db, input })),
  list: auditReadProcedure(AuditListInput).query(({ ctx, input }) => listAuditEvents({ db: ctx.db, input })),
});
