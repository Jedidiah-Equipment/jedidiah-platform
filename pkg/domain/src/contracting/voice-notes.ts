import type { KeytermCandidate, TranscriptionHintOutcome, TranscriptionHintStatus } from '@pkg/schema/contracting';
import { AUDIO_M4A_CONTENT_TYPE } from '../files/file-policy.js';

export { TRANSCRIPTION_HINTS_PER_CORRECTION } from '@pkg/schema/contracting';

export const VOICE_NOTE_MAX_SECONDS = 120;
export const VOICE_NOTE_POLICY = {
  allowedContentTypes: [AUDIO_M4A_CONTENT_TYPE],
  maxBytes: 5 * 1024 * 1024,
} as const;
export const TRANSCRIBE_PATH = '/api/contracting/transcriptions';
export const TRANSCRIBE_TIMEOUT_MS = 30_000;
export const TRANSCRIPTION_HINT_CAP = 100;
const KEYTERM_MAX_LENGTH = 50;
/** Keyterms per speech call, sent as `keywords`: gpt-transcribe refuses a form of more than 1,000 fields (measured 2026-10-08), the audio and options included. */
export const SPEECH_KEYTERM_CAP = 900;
/** Marks a per-note part of a prompt the Transcriptions page shows in place of a real note. */
export const promptPlaceholder = (name: string) => `{{${name}}}`;
export const PROMPT_PLACEHOLDER_PATTERN = /(\{\{[^}]+\}\})/;

/** Hints are distilled from English notes only for now; the gate is the provider's language tag. */
export const hintDerivationLanguages = ['en', 'eng'] as const;

export function isHintDerivationLanguage(language: string | null): boolean {
  if (language === null) {
    return false;
  }

  const primary = language.trim().toLowerCase().split('-')[0] ?? '';

  return (hintDerivationLanguages as readonly string[]).includes(primary);
}

/** A rewrite is not a correction: same text, or empty, derives nothing. */
export function transcriptionWasCorrected(shown: string, saved: string): boolean {
  return saved.trim() !== '' && saved.trim() !== shown.trim();
}

/** Keyterm hygiene for the speech service: one line, trimmed, at most 50 characters, no angle brackets (the API refuses them), unique ignoring case. */
function shapeKeytermCandidates<T extends { keyterm: string | null | undefined }>(candidates: readonly T[]) {
  const seen = new Set<string>();
  const shaped: (T & { keyterm: string })[] = [];

  for (const candidate of candidates) {
    const keyterm = candidate.keyterm?.replace(/\s+/g, ' ').trim() ?? '';
    const key = keyterm.toLowerCase();

    if (keyterm === '' || keyterm.length > KEYTERM_MAX_LENGTH || /[<>]/.test(keyterm) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    shaped.push({ ...candidate, keyterm });
  }

  return shaped;
}

/**
 * The keyterms the speech call sends, from the sourced registry in its order so taught keyterms come first and the
 * cap drops the tail. Also every keyterm the cap left out, with its source.
 */
export function speechKeyterms(candidates: readonly KeytermCandidate[]): {
  keyterms: string[];
  cutOff: KeytermCandidate[];
} {
  const shaped = shapeKeytermCandidates(candidates);

  return {
    keyterms: shaped.slice(0, SPEECH_KEYTERM_CAP).map((candidate) => candidate.keyterm),
    cutOff: shaped.slice(SPEECH_KEYTERM_CAP).map(({ keyterm, source }) => ({ keyterm, source })),
  };
}

/** Where a Transcription's hint derivation stands; the hints it left prove the outcome even where none was kept. */
export function transcriptionHintStatus(row: {
  language: string | null;
  shownText: string;
  savedText: string | null;
  hintDerivedAt: Date | null;
  hintOutcome: TranscriptionHintOutcome | null;
  hintNoneReason: string | null;
  hintIds: string[];
}): TranscriptionHintStatus {
  if (row.savedText === null) return { kind: 'not_saved' };
  if (row.hintIds.length > 0) return { kind: 'hint_added', hintIds: row.hintIds };
  if (!transcriptionWasCorrected(row.shownText, row.savedText)) return { kind: 'no_correction' };
  if (!isHintDerivationLanguage(row.language)) return { kind: 'not_english' };
  if (row.hintDerivedAt === null) return { kind: 'pending' };
  if (row.hintOutcome === 'none') return { kind: 'no_hint', reason: row.hintNoneReason ?? '' };
  return { kind: 'unknown' };
}

/** Appends a transcript to what the person already typed in the field. */
export function appendTranscript(existing: string, transcript: string): string {
  return existing.trim() === '' ? transcript : `${existing.trimEnd()} ${transcript}`;
}
