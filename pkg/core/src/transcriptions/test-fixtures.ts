import type { Business, KeytermCandidate } from '@pkg/schema';
import type { BoundTranscriptionProfile } from './transcription-profile.js';
import type { TranscriptionEngine } from './transcription-service.js';

/** The smallest bytes the Voice Note file policy accepts as M4A. */
export const M4A_HEADER = new Uint8Array([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);

export const testProfile = (
  business: Business = 'contracting',
  vocabulary: KeytermCandidate[] = [],
): BoundTranscriptionProfile => ({ business, setting: 'a test note', vocabulary: async () => vocabulary });

/** Hears `heard`, tidies by adding a full stop, and derives nothing unless told otherwise. */
export const stubEngine = (
  heard: { text: string; language: string | null },
  overrides: Partial<TranscriptionEngine> = {},
): TranscriptionEngine => ({
  transcribe: async () => heard,
  tidy: async ({ rawText }) => ({ text: `${rawText}.`, language: heard.language }),
  derive: async () => ({ action: 'none', reason: 'Specific to this note.' }),
  ...overrides,
});
