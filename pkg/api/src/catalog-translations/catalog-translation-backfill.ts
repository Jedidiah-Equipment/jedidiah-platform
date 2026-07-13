import { listCatalogTranslationKeys } from '@pkg/core';
import type { Db } from '@pkg/db';
import type { CatalogTranslationKey } from '@pkg/domain';

import type { CatalogTranslationRunResult } from './catalog-translation-runner.js';

export type CatalogTranslationBackfillResult = {
  failed: number;
  skipped: number;
  translated: number;
};

type CatalogTranslationBackfillProgress = {
  completed: number;
  error?: unknown;
  key: CatalogTranslationKey;
  result: CatalogTranslationRunResult | 'failed';
  total: number;
};

export async function runCatalogTranslationBackfill({
  concurrency = 2,
  db,
  onProgress = () => undefined,
  run,
}: {
  concurrency?: number;
  db: Db;
  onProgress?: (progress: CatalogTranslationBackfillProgress) => void;
  run: (key: CatalogTranslationKey) => Promise<CatalogTranslationRunResult>;
}): Promise<CatalogTranslationBackfillResult> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('Translation backfill concurrency must be a positive integer');
  }

  const keys = await listCatalogTranslationKeys({ db });
  const counts: CatalogTranslationBackfillResult = { failed: 0, skipped: 0, translated: 0 };
  let completed = 0;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < keys.length) {
      const key = keys[nextIndex];
      nextIndex += 1;
      if (!key) return;

      try {
        const result = await run(key);
        counts[result] += 1;
        completed += 1;
        onProgress({ completed, key, result, total: keys.length });
      } catch (error) {
        counts.failed += 1;
        completed += 1;
        onProgress({ completed, error, key, result: 'failed', total: keys.length });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, () => worker()));
  return counts;
}
