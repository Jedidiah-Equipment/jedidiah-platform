import { recordTranscriptionSaved } from '@pkg/core/contracting';
import { TranscriptionSavedInput } from '@pkg/schema/contracting';
import type { BackgroundQueue } from '../../../background-queue.js';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { transcriptionErrorFamily } from '../contracting-error-families.js';

/** Transcribing goes through the multipart upload route; this router only hears that the owning form saved. */
export function createContractingTranscriptionsRouter(hints: Pick<BackgroundQueue<string>, 'schedule'>) {
  return router({
    saved: authorizedProcedure('contracting_transcription:use')
      .input(TranscriptionSavedInput)
      .mutation(async ({ ctx, input }) => {
        const result = await mapCoreErrors(
          () => recordTranscriptionSaved({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
          transcriptionErrorFamily,
        );
        // After the write; the response never waits on the model.
        if (result.deriveHint) hints.schedule(result.id);
      }),
  });
}
