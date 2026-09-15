import {
  amendReading,
  listFieldMachines,
  listFieldReadings,
  listReadingExceptions,
  listReadingsByMachine,
  type ReadMeterPhoto,
  reverifyReading,
} from '@pkg/core/contracting';
import {
  FieldMachine,
  FieldReading,
  HourReading,
  ReadingAmendInput,
  ReadingException,
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
      .query(({ ctx }) => listFieldMachines({ db: ctx.db })),
    fieldHistory: authorizedProcedure(['contracting_machine:read', 'contracting_reading:capture'])
      .input(ReadingMachineInput)
      .output(FieldReading.array())
      .query(({ ctx, input }) => listFieldReadings({ db: ctx.db, ...input })),
    listByMachine: authorizedProcedure('contracting_machine:read')
      .input(ReadingMachineInput)
      .output(HourReading.array())
      .query(({ ctx, input }) => listReadingsByMachine({ db: ctx.db, ...input })),
    listExceptions: authorizedProcedure('contracting_reading:update')
      .output(ReadingException.array())
      .query(({ ctx }) => listReadingExceptions({ db: ctx.db })),
    amend: authorizedProcedure('contracting_reading:update')
      .input(ReadingAmendInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => amendReading({ db: ctx.db, actorUserId: ctx.session.user.id, input }), readingErrorFamily),
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
