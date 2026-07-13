import { translateCatalogSourceToAfrikaans } from '@pkg/ai';
import { loadCatalogTranslationSource, persistCatalogTranslation } from '@pkg/core';
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

    const translation = await translateCatalogSourceToAfrikaans({ kind: source.kind, model, source: source.canonical });

    // Model calls are slow enough for catalog edits to land mid-flight; persist rechecks the source hash
    // inside its transaction and skips the write, so a stale result is never published.
    const persisted = await persistCatalogTranslation({
      db,
      kind: source.kind,
      source,
      translatedAt: now(),
      translation,
    });
    return persisted === 'persisted' ? 'translated' : 'skipped';
  };
}
