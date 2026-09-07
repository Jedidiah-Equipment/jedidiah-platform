import {
  amendReading,
  captureReading,
  isReadingError,
  listReadingExceptions,
  listReadingsByMachine,
  type ReadMeterPhoto,
  reverifyReading,
} from '@pkg/core/contracting';
import { canCaptureBaseline } from '@pkg/domain/contracting';
import {
  HourReading,
  ReadingAmendInput,
  ReadingCaptureInput,
  ReadingException,
  ReadingIdInput,
  ReadingMachineInput,
} from '@pkg/schema/contracting';
import { TRPCError } from '@trpc/server';
import { mapKnownCoreError } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';

export function mapReadingErrors<T>(action: () => Promise<T>) {
  return mapKnownCoreError(action, isReadingError, (error) => ({
    appCode: error.code,
    message: error.message,
    code:
      error.code === 'reading.not_found' ? 'NOT_FOUND' : error.code === 'reading.no_photo' ? 'BAD_REQUEST' : 'CONFLICT',
  }));
}
export function createContractingReadingsRouter(
  readPhoto: ReadMeterPhoto = async () => {
    throw new Error('Meter reader not configured');
  },
) {
  return router({
    captureBaseline: authorizedProcedure('contracting_reading:capture')
      .input(ReadingCaptureInput.omit({ role: true, disputePrevious: true }))
      .mutation(({ ctx, input }) => {
        if (!canCaptureBaseline(ctx.access))
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only a Contracting administrator can capture a Baseline Reading.',
          });
        return mapReadingErrors(() =>
          captureReading({
            db: ctx.db,
            actorUserId: ctx.session.user.id,
            input: { ...input, role: 'baseline', disputePrevious: false },
          }),
        );
      }),
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
        mapReadingErrors(() => amendReading({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
      ),
    reverify: authorizedProcedure('contracting_reading:update')
      .input(ReadingIdInput)
      .mutation(({ ctx, input }) =>
        mapReadingErrors(() =>
          reverifyReading({
            db: ctx.db,
            actorUserId: ctx.session.user.id,
            id: input.id,
            storage: ctx.storage,
            readPhoto,
          }),
        ),
      ),
  });
}
