import {
  translateProductBundleToAfrikaans,
  translateProductRangeToAfrikaans,
  translateProductRangeVariantToAfrikaans,
} from '@pkg/ai';
import { type CatalogTranslationSource, loadCatalogTranslationSource, persistCatalogTranslation } from '@pkg/core';
import type { Db } from '@pkg/db';
import type { CatalogTranslationKey } from '@pkg/domain';
import type { LanguageModel } from 'ai';

export type CatalogTranslationRunResult = 'skipped' | 'translated';

export function createCatalogTranslationRunner({
  db,
  model,
  now = () => new Date(),
}: {
  db: Db;
  model: LanguageModel;
  now?: () => Date;
}): (key: CatalogTranslationKey) => Promise<CatalogTranslationRunResult> {
  return async (key) => {
    const source = await loadCatalogTranslationSource({ db, key });
    if (!source || source.state === 'fresh') return 'skipped';

    if (source.kind === 'product') {
      const translation = await translateProductBundleToAfrikaans({ model, source: source.canonical });
      if (!(await isCatalogSourceUnchanged(db, source))) return 'skipped';
      await persistCatalogTranslation({ db, source, translatedAt: now(), translation });
    } else if (source.kind === 'range') {
      const translation = await translateProductRangeToAfrikaans({ model, source: source.canonical });
      if (!(await isCatalogSourceUnchanged(db, source))) return 'skipped';
      await persistCatalogTranslation({ db, source, translatedAt: now(), translation });
    } else {
      const translation = await translateProductRangeVariantToAfrikaans({ model, source: source.canonical });
      if (!(await isCatalogSourceUnchanged(db, source))) return 'skipped';
      await persistCatalogTranslation({ db, source, translatedAt: now(), translation });
    }

    return 'translated';
  };
}

async function isCatalogSourceUnchanged(db: Db, source: CatalogTranslationSource): Promise<boolean> {
  // Model calls are slow enough for catalog edits to land mid-flight; never publish their stale result.
  const latest = await loadCatalogTranslationSource({ db, key: source.key });
  return latest?.sourceHash === source.sourceHash;
}
