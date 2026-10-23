import type { TranscriptionProfile } from '../../transcriptions/transcription-profile.js';

/** Equipment's part of the Voice Note pipeline. No Equipment role may use voice notes yet, so it primes nothing. */
export const equipmentTranscriptionProfile: TranscriptionProfile = {
  setting: "a short voice note from a South African agricultural-equipment manufacturer's workshop and sales floor",
  loadVocabulary: async () => [],
};
