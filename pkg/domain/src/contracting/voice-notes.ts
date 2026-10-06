import { AUDIO_M4A_CONTENT_TYPE } from '../files/file-policy.js';

export const VOICE_NOTE_MAX_SECONDS = 120;
export const VOICE_NOTE_POLICY = {
  allowedContentTypes: [AUDIO_M4A_CONTENT_TYPE],
  maxBytes: 5 * 1024 * 1024,
} as const;
export const TRANSCRIBE_PATH = '/api/contracting/transcriptions';
export const TRANSCRIBE_TIMEOUT_MS = 30_000;
export const TRANSCRIPTION_HINT_CAP = 100;
const KEYTERM_MAX_LENGTH = 50;
/** The speech model's prompt budget: whisper-1 caps it at 224 tokens. */
const KEYTERM_PROMPT_MAX_CHARS = 600;

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

/** Keyterm hygiene for the speech service: trimmed, at most 50 characters, unique ignoring case, capped. */
export function shapeKeyterms(candidates: readonly (string | null | undefined)[], cap = 300): string[] {
  const seen = new Set<string>();
  const keyterms: string[] = [];

  for (const candidate of candidates) {
    const keyterm = candidate?.replace(/\s+/g, ' ').trim() ?? '';
    const key = keyterm.toLowerCase();

    if (keyterm === '' || keyterm.length > KEYTERM_MAX_LENGTH || seen.has(key)) {
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

/**
 * The keyterms as the free-text prompt the speech model is biased by: comma-separated in registry order, so the
 * terms that come first (fleet and people) survive and farm names drop off when the budget runs out.
 */
export function promptFromKeyterms(keyterms: readonly string[], maxChars = KEYTERM_PROMPT_MAX_CHARS): string {
  let prompt = '';

  for (const keyterm of keyterms) {
    const next = prompt === '' ? keyterm : `${prompt}, ${keyterm}`;

    if (next.length > maxChars) {
      break;
    }

    prompt = next;
  }

  return prompt;
}

/** Appends a transcript to what the person already typed in the field. */
export function appendTranscript(existing: string, transcript: string): string {
  return existing.trim() === '' ? transcript : `${existing.trimEnd()} ${transcript}`;
}
