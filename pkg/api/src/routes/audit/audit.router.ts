import { listAuditEvents } from '@pkg/core';
import { AuditListInput } from '@pkg/schema';

import { authorizedProcedure, router } from '../../trpc/init.js';

export const auditRouter = router({
  list: authorizedProcedure('audit:read')
    .input(AuditListInput)
    .query(({ ctx, input }) => listAuditEvents(ctx.db, input)),
});
