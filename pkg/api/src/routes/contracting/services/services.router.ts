import {
  closeServiceRecord,
  getServiceRecord,
  listMechanics,
  listServiceRecordFilterOptions,
  listServiceRecords,
  openServiceRecord,
  patchServiceRecord,
  summarizeServiceRecords,
} from '@pkg/core/contracting';
import {
  Mechanic,
  ServiceRecord,
  ServiceRecordCloseInput,
  ServiceRecordFilterOptions,
  ServiceRecordIdInput,
  ServiceRecordListInput,
  ServiceRecordListResult,
  ServiceRecordOpenInput,
  ServiceRecordPatchInput,
  ServiceRecordSummary,
} from '@pkg/schema/contracting';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { serviceErrorFamily } from '../contracting-error-families.js';

export const contractingServicesRouter = router({
  list: authorizedProcedure('contracting_service:read')
    .input(ServiceRecordListInput)
    .output(ServiceRecordListResult)
    .query(({ ctx, input }) => listServiceRecords({ db: ctx.db, input })),
  summary: authorizedProcedure('contracting_service:read')
    .output(ServiceRecordSummary)
    .query(({ ctx }) => summarizeServiceRecords({ db: ctx.db })),
  get: authorizedProcedure('contracting_service:read')
    .input(ServiceRecordIdInput)
    .output(ServiceRecord)
    .query(({ ctx, input }) => mapCoreErrors(() => getServiceRecord({ db: ctx.db, id: input.id }), serviceErrorFamily)),
  open: authorizedProcedure('contracting_service:update')
    .input(ServiceRecordOpenInput)
    .output(ServiceRecord)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => openServiceRecord({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
        serviceErrorFamily,
      ),
    ),
  patch: authorizedProcedure('contracting_service:update')
    .input(ServiceRecordPatchInput)
    .output(ServiceRecord)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => patchServiceRecord({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
        serviceErrorFamily,
      ),
    ),
  close: authorizedProcedure('contracting_service:update')
    .input(ServiceRecordCloseInput)
    .output(ServiceRecord)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => closeServiceRecord({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
        serviceErrorFamily,
      ),
    ),
  options: router({
    filters: authorizedProcedure('contracting_service:read')
      .output(ServiceRecordFilterOptions)
      .query(({ ctx }) => listServiceRecordFilterOptions({ db: ctx.db })),
    mechanics: authorizedProcedure('contracting_service:update')
      .output(Mechanic.array())
      .query(({ ctx }) => listMechanics({ db: ctx.db })),
  }),
});
