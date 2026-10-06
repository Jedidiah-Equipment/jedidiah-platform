import { z } from 'zod';
import { UUID } from '../../common/uuid.js';

export const TranscriptionPurpose = z.string().trim().min(1).max(60);
export const TranscriptionText = z.string().max(4000);
export const transcriptionLanguageTag = z.string().trim().min(2).max(16);
export const transcriptionErrorCodes = [
  // No provider key, provider failure or timeout.
  'transcription.unavailable',
  'transcription.invalid_upload',
  'transcription.not_found',
  // Reporting a save on someone else's Transcription.
  'transcription.forbidden',
  'transcription.already_saved',
] as const;
export type TranscriptionErrorCode = (typeof transcriptionErrorCodes)[number];

/** Multipart fields that travel beside the `audio` part. */
export const TranscribeFields = z.object({ purpose: TranscriptionPurpose }).strict();
export type TranscribeFields = z.infer<typeof TranscribeFields>;
export const Transcription = z.object({
  id: UUID,
  text: TranscriptionText,
  language: transcriptionLanguageTag.nullable(),
});
export type Transcription = z.infer<typeof Transcription>;
export const TranscriptionSavedInput = z
  .object({ id: UUID, text: TranscriptionText, purpose: TranscriptionPurpose })
  .strict();
export type TranscriptionSavedInput = z.infer<typeof TranscriptionSavedInput>;

/** What the derivation model may answer; parsed with the schema so a stray field is refused. No `.default()` — OpenAI strict mode rejects it. */
export const HintDerivation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('none'), reason: z.string().max(200) }),
  z.object({
    action: z.literal('add'),
    rule: z.string().trim().min(1).max(300),
    keyterm: z.string().trim().min(1).max(50).nullable(),
    retireHintId: UUID.nullable(),
  }),
]);
export type HintDerivation = z.infer<typeof HintDerivation>;
