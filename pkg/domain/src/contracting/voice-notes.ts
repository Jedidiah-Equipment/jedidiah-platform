import type { KeytermCandidate, TranscriptionHintStatus } from '@pkg/schema/contracting';
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
export const KEYTERM_PROMPT_MAX_CHARS = 600;
const KEYTERM_CAP = 300;

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
export function shapeKeyterms(candidates: readonly (string | null | undefined)[], cap = KEYTERM_CAP): string[] {
  return shapeKeytermCandidates(
    candidates.map((keyterm) => ({ keyterm })),
    cap,
  ).map((candidate) => candidate.keyterm);
}

function shapeKeytermCandidates<T extends { keyterm: string | null | undefined }>(
  candidates: readonly T[],
  cap: number,
): (T & { keyterm: string })[] {
  const seen = new Set<string>();
  const shaped: (T & { keyterm: string })[] = [];

  for (const candidate of candidates) {
    const keyterm = candidate.keyterm?.replace(/\s+/g, ' ').trim() ?? '';
    const key = keyterm.toLowerCase();

    if (keyterm === '' || keyterm.length > KEYTERM_MAX_LENGTH || seen.has(key)) {
      continue;
    }

    seen.add(key);
    shaped.push({ ...candidate, keyterm });

    if (shaped.length === cap) {
      break;
    }
  }

  return shaped;
}

/**
 * The keyterms as the free-text prompt the speech model is biased by: comma-separated in registry order, so the
 * learned hint keyterms survive the cut, and stopped before the budget is spent.
 */
export function promptFromKeyterms(keyterms: readonly string[], maxChars = KEYTERM_PROMPT_MAX_CHARS): string {
  return fitKeyterms(keyterms, maxChars).prompt;
}

function fitKeyterms(keyterms: readonly string[], maxChars: number): { prompt: string; fitted: number } {
  let prompt = '';
  let fitted = 0;

  for (const keyterm of keyterms) {
    const next = prompt === '' ? keyterm : `${prompt}, ${keyterm}`;

    if (next.length > maxChars) {
      break;
    }

    prompt = next;
    fitted += 1;
  }

  return { prompt, fitted };
}

/** The speech call's prompt from the sourced keyterm registry, and every keyterm the cap or the budget left out. */
export function speechKeytermPrompt(candidates: readonly KeytermCandidate[]): {
  prompt: string;
  cutOff: KeytermCandidate[];
} {
  const shaped = shapeKeytermCandidates(candidates, Number.POSITIVE_INFINITY);
  const { prompt, fitted } = fitKeyterms(
    shaped.slice(0, KEYTERM_CAP).map((candidate) => candidate.keyterm),
    KEYTERM_PROMPT_MAX_CHARS,
  );

  return { prompt, cutOff: shaped.slice(fitted).map(({ keyterm, source }) => ({ keyterm, source })) };
}

/** Where a Transcription's hint derivation stands; a hint it left proves the outcome even where none was kept. */
export function transcriptionHintStatus(row: {
  language: string | null;
  shownText: string;
  savedText: string | null;
  hintDerivedAt: Date | null;
  hintOutcome: 'added' | 'none' | null;
  hintNoneReason: string | null;
  hintId: string | null;
}): TranscriptionHintStatus {
  if (row.savedText === null) return { kind: 'not_saved' };
  if (row.hintId !== null) return { kind: 'hint_added', hintId: row.hintId };
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
