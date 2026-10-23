import type { BoundTranscriptionProfile, TranscriptionEngine } from '@pkg/core';
import type { Business, KeytermCandidate } from '@pkg/schema';

/** The smallest bytes the Voice Note file policy accepts as M4A. */
export const M4A_HEADER = Buffer.from([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);

export const testProfile = (business: Business, vocabulary: KeytermCandidate[] = []): BoundTranscriptionProfile => ({
  business,
  setting: `a test ${business} note`,
  vocabulary: async () => vocabulary,
});

export const testProfiles = (): Record<Business, BoundTranscriptionProfile> => ({
  equipment: testProfile('equipment'),
  contracting: testProfile('contracting'),
});

/** Hears `heard` and keeps it as shown, deriving nothing unless told otherwise. */
export const stubEngine = (
  heard: { text: string; language: string | null },
  overrides: Partial<TranscriptionEngine> = {},
): TranscriptionEngine => ({
  transcribe: async () => heard,
  tidy: async ({ rawText }) => ({ text: rawText, language: null }),
  derive: async () => ({ action: 'none', reason: 'Unused.' }),
  ...overrides,
});
