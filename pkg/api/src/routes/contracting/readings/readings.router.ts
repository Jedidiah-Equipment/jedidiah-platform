import {
  amendReadings,
  estimateReadAtFor,
  latestReading,
  latestTelematicsReading,
  listFieldMachines,
  listFieldReadingsPage,
} from '@pkg/core/contracting';
import {
  FieldMachine,
  FieldReadingPage,
  FieldReadingPageInput,
  HourReading,
  LatestReading,
  LatestTelematics,
  ReadAtEstimate,
  ReadAtEstimateInput,
  ReadingAmendInput,
  ReadingMachineInput,
} from '@pkg/schema/contracting';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { readingErrorFamily } from '../contracting-error-families.js';

// Spot capture goes through the HTTP capture route; Job Hours through contractingJobs.assignments.
export const contractingReadingsRouter = router({
  fieldMachines: authorizedProcedure(['contracting_machine:read', 'contracting_reading:capture'])
    .output(FieldMachine.array())
    .query(({ ctx }) => listFieldMachines({ db: ctx.db, actor: ctx.access })),
  latest: authorizedProcedure(['contracting_machine:read', 'contracting_reading:capture'])
    .input(ReadingMachineInput)
    .output(LatestReading.nullable())
    .query(({ ctx, input }) => latestReading({ db: ctx.db, ...input })),
  latestTelematics: authorizedProcedure(['contracting_machine:read', 'contracting_reading:capture'])
    .input(ReadingMachineInput)
    .output(LatestTelematics.nullable())
    .query(({ ctx, input }) => latestTelematicsReading(ctx.db, input.machineId)),
  fieldHistoryPage: authorizedProcedure(['contracting_machine:read', 'contracting_reading:capture'])
    .input(FieldReadingPageInput)
    .output(FieldReadingPage)
    .query(({ ctx, input }) => listFieldReadingsPage({ db: ctx.db, input })),
  estimateReadAt: authorizedProcedure('contracting_reading:capture')
    .input(ReadAtEstimateInput)
    .output(ReadAtEstimate)
    .query(({ ctx, input }) => estimateReadAtFor({ db: ctx.db, input })),
  amend: authorizedProcedure('contracting_reading:update')
    .input(ReadingAmendInput)
    .output(HourReading.array())
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => amendReadings({ db: ctx.db, actor: ctx.access, input }), readingErrorFamily),
    ),
});
