import {
  amendReadings,
  latestReading,
  listFieldMachines,
  listFieldReadingsPage,
  listReadingExceptions,
  type ReadMeterPhoto,
  reverifyReading,
} from '@pkg/core/contracting';
import {
  FieldMachine,
  FieldReadingPage,
  FieldReadingPageInput,
  HourReading,
  LatestReading,
  ReadingAmendInput,
  ReadingExceptionRow,
  ReadingIdInput,
  ReadingMachineInput,
} from '@pkg/schema/contracting';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { readingErrorFamily } from '../contracting-error-families.js';

// Capture, baseline included, goes through the multipart upload route, which is the only transport that carries a photo.
export function createContractingReadingsRouter(readPhoto: ReadMeterPhoto) {
  return router({
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
    listExceptions: authorizedProcedure('contracting_reading:update')
      .output(ReadingExceptionRow.array())
      .query(({ ctx }) => listReadingExceptions({ db: ctx.db })),
    amend: authorizedProcedure('contracting_reading:update')
      .input(ReadingAmendInput)
      .output(HourReading.array())
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => amendReadings({ db: ctx.db, actor: ctx.access, input }), readingErrorFamily),
      ),
    reverify: authorizedProcedure('contracting_reading:update')
      .input(ReadingIdInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () =>
            reverifyReading({
              db: ctx.db,
              actorUserId: ctx.session.user.id,
              id: input.id,
              storage: ctx.storage,
              readPhoto,
            }),
          readingErrorFamily,
        ),
      ),
  });
}
