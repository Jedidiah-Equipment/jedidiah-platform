import { AUDIO_M4A_CONTENT_TYPE } from '../files/file-policy.js';

export const VOICE_NOTE_MAX_SECONDS = 120;
export const VOICE_NOTE_POLICY = {
  allowedContentTypes: [AUDIO_M4A_CONTENT_TYPE],
  maxBytes: 5 * 1024 * 1024,
} as const;
export const TRANSCRIBE_PATH = '/api/contracting/transcriptions';
export const TRANSCRIBE_TIMEOUT_MS = 30_000;
export const TRANSCRIPTION_HINT_CAP = 100;
// The speech service takes keyterms under 50 characters, of at most five words, without these characters.
const KEYTERM_MAX_LENGTH = 49;
const KEYTERM_MAX_WORDS = 5;
const KEYTERM_UNSUPPORTED_CHARACTERS = /[<>{}[\]\\]/g;

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

/** Keyterm hygiene for the speech service: cleaned, within its limits, unique ignoring case, capped. */
export function shapeKeyterms(candidates: readonly (string | null | undefined)[], cap = 300): string[] {
  const seen = new Set<string>();
  const keyterms: string[] = [];

  for (const candidate of candidates) {
    const keyterm = candidate?.replace(KEYTERM_UNSUPPORTED_CHARACTERS, ' ').replace(/\s+/g, ' ').trim() ?? '';
    const key = keyterm.toLowerCase();

    if (
      keyterm === '' ||
      keyterm.length > KEYTERM_MAX_LENGTH ||
      keyterm.split(' ').length > KEYTERM_MAX_WORDS ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    keyterms.push(keyterm);

    if (keyterms.length === cap) {
      break;
    }
  }

  return keyterms;
}

/** Appends a transcript to what the person already typed in the field. */
export function appendTranscript(existing: string, transcript: string): string {
  return existing.trim() === '' ? transcript : `${existing.trimEnd()} ${transcript}`;
}
