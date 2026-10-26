import { type TranscriptionModels, transcriptionPrompts } from '@pkg/ai';
import {
  type BoundTranscriptionProfile,
  listActiveHints,
  listTranscriptionHints,
  listTranscriptionReviews,
  listTranscriptionUsers,
  recordTranscriptionSaved,
} from '@pkg/core';
import { keytermCandidates, transcriptionPermissions } from '@pkg/domain';
import {
  type Business,
  TranscriptionBusinessInput,
  TranscriptionHintList,
  TranscriptionListInput,
  TranscriptionListResult,
  TranscriptionPrompts,
  TranscriptionSavedInput,
  TranscriptionUser,
} from '@pkg/schema';
import type { z } from 'zod';
import type { Scheduler } from '../../background-queue.js';
import { mapCoreErrors } from '../../trpc/errors.js';
import { authorizedProcedure, businessPermissionProcedure, router } from '../../trpc/init.js';
import { transcriptionErrorFamily } from '../shared-error-families.js';

/** Schedules a Transcription Hint derivation once a corrected Transcription has been saved. */
export type HintDerivations = Scheduler<string>;

/** What the Transcriptions router closes over, built once by the shared transcription wiring. */
export type TranscriptionRouterDependencies = {
  hintDerivations: HintDerivations;
  profiles: Record<Business, BoundTranscriptionProfile>;
  models: TranscriptionModels;
};

const transcriptionProcedure = <TInput extends z.ZodType<{ business: Business }>>(
  kind: 'use' | 'read',
  input: TInput,
) => businessPermissionProcedure(input, (business) => transcriptionPermissions[business][kind]);

/** Transcribing goes through the multipart upload route; this router hears that the owning form saved, and serves the read-only review. */
export function createTranscriptionsRouter({ hintDerivations, profiles, models }: TranscriptionRouterDependencies) {
  return router({
    // The owning form reports what it kept. Only the person who recorded a Transcription may save it, and recording
    // it took that business's `use`, so any business's `use` opens the procedure and the row's owner decides.
    saved: authorizedProcedure(Object.values(transcriptionPermissions).map((permissions) => permissions.use))
      .input(TranscriptionSavedInput)
      .mutation(async ({ ctx, input }) => {
        const result = await mapCoreErrors(
          () => recordTranscriptionSaved({ db: ctx.db, actorUserId: ctx.session.user.id, input }),
          transcriptionErrorFamily,
        );
        // After the write; the response never waits on the model.
        if (result.deriveHint) hintDerivations.schedule(result.id);
      }),
    list: transcriptionProcedure('read', TranscriptionListInput)
      .output(TranscriptionListResult)
      .query(({ ctx, input }) => listTranscriptionReviews({ db: ctx.db, input })),
    users: transcriptionProcedure('read', TranscriptionBusinessInput)
      .output(TranscriptionUser.array())
      .query(({ ctx, input: { business } }) => listTranscriptionUsers({ db: ctx.db, business })),
    hints: transcriptionProcedure('read', TranscriptionBusinessInput)
      .output(TranscriptionHintList)
      .query(({ ctx, input: { business } }) => listTranscriptionHints({ db: ctx.db, business })),
    prompts: transcriptionProcedure('read', TranscriptionBusinessInput)
      .output(TranscriptionPrompts)
      .query(async ({ ctx, input: { business } }) => {
        const { setting, vocabulary } = profiles[business];
        const [hints, terms] = await Promise.all([listActiveHints({ db: ctx.db, business }), vocabulary()]);
        return transcriptionPrompts({ hints, keyterms: keytermCandidates(hints, terms), models, setting });
      }),
  });
}
