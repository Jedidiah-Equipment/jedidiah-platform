import {
  amendReading,
  deleteReading,
  estimateReadAtFor,
  latestReading,
  latestTelematicsReading,
  listFieldMachines,
} from '@pkg/core/contracting';
import { meterReadPermissions } from '@pkg/domain/contracting';
import {
  FieldMachine,
  HourReading,
  LatestReading,
  LatestTelematics,
  ReadAtEstimate,
  ReadAtEstimateInput,
  ReadingAmendInput,
  ReadingDeleteInput,
  ReadingMachineInput,
} from '@pkg/schema/contracting';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { readingErrorFamily } from '../contracting-error-families.js';

// Spot capture goes through the HTTP capture route; Job Hours through contractingJobs.assignments.
export const contractingReadingsRouter = router({
  fieldMachines: authorizedProcedure(meterReadPermissions)
    .output(FieldMachine.array())
    .query(({ ctx }) => listFieldMachines({ db: ctx.db, actor: ctx.access })),
  latest: authorizedProcedure(meterReadPermissions)
    .input(ReadingMachineInput)
    .output(LatestReading.nullable())
    .query(({ ctx, input }) => latestReading({ db: ctx.db, ...input })),
  latestTelematics: authorizedProcedure(meterReadPermissions)
    .input(ReadingMachineInput)
    .output(LatestTelematics.nullable())
    .query(({ ctx, input }) => latestTelematicsReading(ctx.db, input.machineId)),
  estimateReadAt: authorizedProcedure('contracting_reading:capture')
    .input(ReadAtEstimateInput)
    .output(ReadAtEstimate)
    .query(({ ctx, input }) => estimateReadAtFor({ db: ctx.db, input })),
  amend: authorizedProcedure('contracting_reading:update')
    .input(ReadingAmendInput)
    .output(HourReading)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => amendReading({ db: ctx.db, actor: ctx.access, input }), readingErrorFamily),
    ),
  delete: authorizedProcedure('contracting_reading:update')
    .input(ReadingDeleteInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => deleteReading({ db: ctx.db, actor: ctx.access, input }), readingErrorFamily),
    ),
});
