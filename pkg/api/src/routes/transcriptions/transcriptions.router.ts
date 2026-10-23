import { type TranscriptionModels, transcriptionPrompts } from '@pkg/ai';
import {
  listActiveHints,
  listTranscriptionHints,
  listTranscriptionReviews,
  listTranscriptionUsers,
  recordTranscriptionSaved,
} from '@pkg/core';
import { transcriptionPermissions } from '@pkg/domain';
import {
  type Business,
  type KeytermCandidate,
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
import { protectedProcedure, requirePermission, router } from '../../trpc/init.js';
import { transcriptionErrorFamily } from '../shared-error-families.js';

/** Schedules a Transcription Hint derivation once a corrected Transcription has been saved. */
export type HintDerivations = Scheduler<string>;

/** What the Transcriptions router closes over, built once by the shared transcription wiring. */
export type TranscriptionRouterDependencies = {
  hintDerivations: HintDerivations;
  /** Each business's keyterm registry, from the same caches its speech calls are biased by. */
  keyterms: Record<Business, () => Promise<KeytermCandidate[]>>;
  /** Each business's tidy-prompt setting, from its profile. */
  settings: Record<Business, string>;
  models: TranscriptionModels;
};

/** One Transcription mechanism serves both businesses; the input's business decides which permission opens it. */
function transcriptionProcedure<TInput extends z.ZodType<{ business: Business }>>(kind: 'use' | 'read', input: TInput) {
  return protectedProcedure.input(input).use(({ ctx, input: { business }, next }) => {
    requirePermission(ctx.access, transcriptionPermissions[business][kind]);
    return next();
  });
}

/** Transcribing goes through the multipart upload route; this router hears that the owning form saved, and serves the read-only review. */
export function createTranscriptionsRouter({
  hintDerivations,
  keyterms,
  settings,
  models,
}: TranscriptionRouterDependencies) {
  return router({
    saved: transcriptionProcedure('use', TranscriptionSavedInput).mutation(async ({ ctx, input }) => {
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
        const [hints, registry] = await Promise.all([listActiveHints({ db: ctx.db, business }), keyterms[business]()]);
        return transcriptionPrompts({ hints, keyterms: registry, models, setting: settings[business] });
      }),
  });
}
