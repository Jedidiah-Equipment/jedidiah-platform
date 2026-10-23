import { recordTranscriptionSaved } from '@pkg/core';
import { TranscriptionSavedInput } from '@pkg/schema';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { transcriptionErrorFamily } from '../../shared-error-families.js';
import type { HintDerivations } from '../../transcriptions/transcriptions.router.js';

/** The save report phones from before the shared router still send; always a Contracting Transcription. */
const ContractingSavedInput = TranscriptionSavedInput.omit({ business: true });

/**
 * Kept only for phones that have not pulled the OTA moving voice notes to `transcriptions`. Drop it with the
 * follow-up ticket "Drop the Contracting transcription aliases".
 */
export function createContractingTranscriptionsRouter({ hintDerivations }: { hintDerivations: HintDerivations }) {
  return router({
    saved: authorizedProcedure('contracting_transcription:use')
      .input(ContractingSavedInput)
      .mutation(async ({ ctx, input }) => {
        const result = await mapCoreErrors(
          () =>
            recordTranscriptionSaved({
              db: ctx.db,
              actorUserId: ctx.session.user.id,
              input: { ...input, business: 'contracting' },
            }),
          transcriptionErrorFamily,
        );
        if (result.deriveHint) hintDerivations.schedule(result.id);
      }),
  });
}
