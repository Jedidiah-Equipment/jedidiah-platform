import {
  amendReadings,
  latestReading,
  listDisputes,
  listFieldMachines,
  listFieldReadingsPage,
} from '@pkg/core/contracting';
import {
  FieldMachine,
  FieldReadingPage,
  FieldReadingPageInput,
  HourReading,
  LatestReading,
  ReadingAmendInput,
  ReadingDispute,
  ReadingMachineInput,
} from '@pkg/schema/contracting';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { readingErrorFamily } from '../contracting-error-families.js';

// Capture, baseline included, goes through the HTTP capture route.
export const contractingReadingsRouter = router({
  fieldMachines: authorizedProcedure(['contracting_machine:read', 'contracting_reading:capture'])
    .output(FieldMachine.array())
    .query(({ ctx }) => listFieldMachines({ db: ctx.db, actor: ctx.access })),
  latest: authorizedProcedure(['contracting_machine:read', 'contracting_reading:capture'])
    .input(ReadingMachineInput)
    .output(LatestReading.nullable())
    .query(({ ctx, input }) => latestReading({ db: ctx.db, ...input })),
  fieldHistoryPage: authorizedProcedure(['contracting_machine:read', 'contracting_reading:capture'])
    .input(FieldReadingPageInput)
    .output(FieldReadingPage)
    .query(({ ctx, input }) => listFieldReadingsPage({ db: ctx.db, input })),
  listDisputes: authorizedProcedure('contracting_reading:update')
    .output(ReadingDispute.array())
    .query(({ ctx }) => listDisputes({ db: ctx.db })),
  amend: authorizedProcedure('contracting_reading:update')
    .input(ReadingAmendInput)
    .output(HourReading.array())
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => amendReadings({ db: ctx.db, actor: ctx.access, input }), readingErrorFamily),
    ),
});
