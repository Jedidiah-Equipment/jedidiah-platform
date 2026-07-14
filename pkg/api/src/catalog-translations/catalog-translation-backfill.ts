import { listCatalogTranslationKeysNeedingTranslation } from '@pkg/core';
import type { Db } from '@pkg/db';
import type { CatalogTranslationKey } from '@pkg/domain';

import type { CatalogTranslationRunResult } from './catalog-translation-runner.js';
import { ConcurrencyLimit } from './concurrency-limit.js';

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

  const keys = await listCatalogTranslationKeysNeedingTranslation({ db });
  const counts: CatalogTranslationBackfillResult = { failed: 0, skipped: 0, translated: 0 };
  const limit = new ConcurrencyLimit(concurrency);
  let completed = 0;

  await Promise.all(
    keys.map((key) =>
      limit.run(async () => {
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
      }),
    ),
  );
  return counts;
}
