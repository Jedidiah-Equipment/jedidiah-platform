import type { KeytermCandidate } from '@pkg/schema';

/** Serves one business's vocabulary per TTL, so a note never costs a fleet sweep. A failed load is retried next time. */
export function cacheVocabulary(
  load: () => Promise<KeytermCandidate[]>,
  ttlMs = 5 * 60_000,
  clock: () => number = Date.now,
): () => Promise<KeytermCandidate[]> {
  let cached: { at: number; vocabulary: Promise<KeytermCandidate[]> } | null = null;

  return () => {
    if (!cached || clock() - cached.at >= ttlMs) {
      const vocabulary = load();
      const entry = { at: clock(), vocabulary };
      cached = entry;
      vocabulary.catch(() => {
        if (cached === entry) cached = null;
      });
    }
    return cached.vocabulary;
  };
}
