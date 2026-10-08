import { type TranscriptionModels, transcriptionPrompts } from '@pkg/ai/contracting';
import {
  listActiveHints,
  listTranscriptionHints,
  listTranscriptionReviews,
  recordTranscriptionSaved,
} from '@pkg/core/contracting';
import {
  type KeytermCandidate,
  TranscriptionHintList,
  TranscriptionListInput,
  TranscriptionListResult,
  TranscriptionPrompts,
  TranscriptionSavedInput,
} from '@pkg/schema/contracting';
import type { Scheduler } from '../../../background-queue.js';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { transcriptionErrorFamily } from '../contracting-error-families.js';

/** Schedules a Transcription Hint derivation once a corrected Transcription has been saved. */
export type HintDerivations = Scheduler<string>;

const reviewer = authorizedProcedure('contracting_transcription:read');

/** Transcribing goes through the multipart upload route; this router hears that the owning form saved, and serves the read-only review. */
export function createContractingTranscriptionsRouter({
  hintDerivations,
  keyterms,
  models,
}: {
  hintDerivations: HintDerivations;
  /** The keyterm registry the speech calls are biased by, from the same cache. */
  keyterms: () => Promise<KeytermCandidate[]>;
  models: TranscriptionModels;
}) {
  return router({
    saved: authorizedProcedure('contracting_transcription:use')
      .input(TranscriptionSavedInput)
      .mutation(async ({ ctx, input }) => {
        const result = await mapCoreErrors(
          () => recordTranscriptionSaved({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
          transcriptionErrorFamily,
        );
        // After the write; the response never waits on the model.
        if (result.deriveHint) hintDerivations.schedule(result.id);
      }),
    list: reviewer
      .input(TranscriptionListInput)
      .output(TranscriptionListResult)
      .query(({ ctx, input }) => listTranscriptionReviews({ db: ctx.db, input })),
    hints: reviewer.output(TranscriptionHintList).query(({ ctx }) => listTranscriptionHints({ db: ctx.db })),
    prompts: reviewer.output(TranscriptionPrompts).query(async ({ ctx }) => {
      const [hints, registry] = await Promise.all([listActiveHints({ db: ctx.db }), keyterms()]);
      return transcriptionPrompts({ hints, keyterms: registry, models });
    }),
  });
}
