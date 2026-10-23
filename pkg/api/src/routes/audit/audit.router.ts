import { listAuditActors, listAuditEvents } from '@pkg/core';
import { auditReadPermissions } from '@pkg/domain';
import { AuditActorsInput, AuditListInput, type Business } from '@pkg/schema';
import type { z } from 'zod';

import { businessPermissionProcedure, router } from '../../trpc/init.js';

const auditReadProcedure = <TInput extends z.ZodType<{ business: Business }>>(input: TInput) =>
  businessPermissionProcedure(input, (business) => auditReadPermissions[business]);

export const auditRouter = router({
  actors: auditReadProcedure(AuditActorsInput).query(({ ctx, input }) => listAuditActors({ db: ctx.db, input })),
  list: auditReadProcedure(AuditListInput).query(({ ctx, input }) => listAuditEvents({ db: ctx.db, input })),
});
