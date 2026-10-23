import type { Db } from '@pkg/db';
import type { KeytermCandidate } from '@pkg/schema';

/**
 * What one business brings to the shared Voice Note pipeline: where its notes are spoken, for the tidy prompt, and
 * the proper nouns its speech model should expect. Each business exports one; the API composes both.
 */
export type TranscriptionProfile = {
  /** Completes "You tidy a speech-to-text transcript of …". */
  setting: string;
  /** The business's own Keyterms in prompt order; the pipeline puts its taught hint keyterms first. */
  loadVocabulary: (input: { db: Db; now?: Date }) => Promise<KeytermCandidate[]>;
};
