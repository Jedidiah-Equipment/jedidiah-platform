import {
  closeServiceRecord,
  getServiceRecord,
  listMechanics,
  listServiceRecords,
  openServiceRecord,
  patchServiceRecord,
} from '@pkg/core/contracting';
import {
  Mechanic,
  ServiceRecord,
  ServiceRecordCloseInput,
  ServiceRecordIdInput,
  ServiceRecordListInput,
  ServiceRecordOpenInput,
  ServiceRecordPatchInput,
} from '@pkg/schema/contracting';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { serviceErrorFamily } from '../contracting-error-families.js';

export const contractingServicesRouter = router({
  list: authorizedProcedure('contracting_service:read')
    .input(ServiceRecordListInput)
    .output(ServiceRecord.array())
    .query(({ ctx, input }) => listServiceRecords({ db: ctx.db, machineId: input.machineId })),
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
    mechanics: authorizedProcedure('contracting_service:update')
      .output(Mechanic.array())
      .query(({ ctx }) => listMechanics({ db: ctx.db })),
  }),
});
