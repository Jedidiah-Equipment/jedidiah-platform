import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { createCursorQueryResult, createSortedCursorQueryInput } from '../../common/pagination.js';
import { UUID } from '../../common/uuid.js';

export const TranscriptionPurpose = z.string().trim().min(1).max(60);
export const TranscriptionText = z.string().max(4000);
export const transcriptionLanguageTag = z.string().trim().min(2).max(16);
export const transcriptionErrorCodes = [
  // The speech model failed or timed out.
  'transcription.unavailable',
  // The speech model answered, but heard no words.
  'transcription.nothing_heard',
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

/** The most hints one corrected Transcription may teach, one per distinct reusable correction. */
export const TRANSCRIPTION_HINTS_PER_CORRECTION = 3;

/** One fact a correction teaches: a rule, the proper noun it is about, and the hint it replaces. */
export const DerivedTranscriptionHint = z.object({
  rule: z.string().trim().min(1).max(300),
  keyterm: z.string().trim().min(1).max(50).nullable(),
  retireHintId: UUID.nullable(),
});
export type DerivedTranscriptionHint = z.infer<typeof DerivedTranscriptionHint>;

/** What the derivation model may answer; parsed with the schema so a stray field is refused. No `.default()` — OpenAI strict mode rejects it. */
export const HintDerivation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('none'), reason: z.string().max(200) }),
  z.object({
    action: z.literal('add'),
    hints: DerivedTranscriptionHint.array().min(1).max(TRANSCRIPTION_HINTS_PER_CORRECTION),
  }),
]);
export type HintDerivation = z.infer<typeof HintDerivation>;

/** What a hint derivation decided, kept on the Transcription. */
export const transcriptionHintOutcomes = ['added', 'none'] as const;
export type TranscriptionHintOutcome = (typeof transcriptionHintOutcomes)[number];

/** Where a Transcription's hint derivation stands, as the Transcriptions page reads it. */
export const TranscriptionHintStatus = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('not_saved') }),
  z.object({ kind: z.literal('no_correction') }),
  z.object({ kind: z.literal('not_english') }),
  z.object({ kind: z.literal('pending') }),
  z.object({ kind: z.literal('hint_added'), hintIds: UUID.array().min(1) }),
  z.object({ kind: z.literal('no_hint'), reason: z.string() }),
  // Derived before the outcome was kept.
  z.object({ kind: z.literal('unknown') }),
]);
export type TranscriptionHintStatus = z.infer<typeof TranscriptionHintStatus>;
export const TranscriptionReviewItem = z.object({
  id: UUID,
  createdAt: DateIso,
  createdByUserId: AuthId,
  createdByName: z.string(),
  purpose: z.string(),
  language: z.string().nullable(),
  rawText: z.string(),
  shownText: z.string(),
  savedText: z.string().nullable(),
  hintStatus: TranscriptionHintStatus,
});
export type TranscriptionReviewItem = z.infer<typeof TranscriptionReviewItem>;
export const TranscriptionListInput = createSortedCursorQueryInput({
  defaultSortDirection: 'desc',
  shape: { createdByUserIds: z.array(AuthId).default([]) },
  sortBy: z.enum(['createdAt']).default('createdAt'),
});
export type TranscriptionListInput = z.infer<typeof TranscriptionListInput>;
export const TranscriptionListResult = createCursorQueryResult(TranscriptionReviewItem);
export type TranscriptionListResult = z.infer<typeof TranscriptionListResult>;
/** Someone who has recorded a Voice Note, for filtering the Transcriptions by who recorded them. */
export const TranscriptionUser = z.object({ id: AuthId, name: z.string() });
export type TranscriptionUser = z.infer<typeof TranscriptionUser>;

export const TranscriptionHintRow = z.object({
  id: UUID,
  rule: z.string(),
  keyterm: z.string().nullable(),
  createdAt: DateIso,
  retiredAt: DateIso.nullable(),
  supersededBy: z.object({ id: UUID, rule: z.string() }).nullable(),
  source: z
    .object({ id: UUID, rawText: z.string(), shownText: z.string(), savedText: z.string().nullable() })
    .nullable(),
});
export type TranscriptionHintRow = z.infer<typeof TranscriptionHintRow>;
export const TranscriptionHintList = z.object({
  cap: z.number().int(),
  activeCount: z.number().int(),
  hints: TranscriptionHintRow.array(),
});
export type TranscriptionHintList = z.infer<typeof TranscriptionHintList>;

export const keytermSources = ['hint', 'machine', 'implement', 'category', 'person', 'farm', 'customer'] as const;
export const KeytermSource = z.enum(keytermSources);
export type KeytermSource = z.infer<typeof KeytermSource>;
export const KeytermCandidate = z.object({ keyterm: z.string(), source: KeytermSource });
export type KeytermCandidate = z.infer<typeof KeytermCandidate>;
/** The three model calls as they would be sent now; per-note parts are `{{placeholders}}`. */
export const TranscriptionPrompts = z.object({
  speech: z.object({
    model: z.string(),
    keyterms: z.string().array(),
    maxKeyterms: z.number().int(),
    cutOff: KeytermCandidate.array(),
  }),
  tidy: z.object({ model: z.string(), system: z.string(), prompt: z.string() }),
  derivation: z.object({ model: z.string(), system: z.string(), prompt: z.string() }),
});
export type TranscriptionPrompts = z.infer<typeof TranscriptionPrompts>;
