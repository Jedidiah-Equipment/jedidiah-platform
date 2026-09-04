import { listAuditEvents } from '@pkg/core/equipment';
import { AuditListInput } from '@pkg/schema';

import { authorizedProcedure, router } from '../../../trpc/init.js';

export const auditRouter = router({
  list: authorizedProcedure('equipment_audit:read')
    .input(AuditListInput)
    .query(({ ctx, input }) => listAuditEvents({ db: ctx.db, input })),
});
