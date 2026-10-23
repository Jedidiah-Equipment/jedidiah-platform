import type { KeytermCandidate } from '@pkg/schema';

/** Serves one registry per TTL so a note never costs a fleet sweep. */
export function createKeytermCache(
  load: () => Promise<KeytermCandidate[]>,
  ttlMs = 5 * 60_000,
  clock: () => number = Date.now,
): { current: () => Promise<KeytermCandidate[]>; invalidate: () => void } {
  let cached: { at: number; keyterms: Promise<KeytermCandidate[]> } | null = null;

  return {
    current: () => {
      if (!cached || clock() - cached.at >= ttlMs) {
        const keyterms = load();
        const entry = { at: clock(), keyterms };
        cached = entry;
        // A failed load is not cached: the next note tries again.
        keyterms.catch(() => {
          if (cached === entry) cached = null;
        });
      }

      return cached.keyterms;
    },
    invalidate: () => {
      cached = null;
    },
  };
}
