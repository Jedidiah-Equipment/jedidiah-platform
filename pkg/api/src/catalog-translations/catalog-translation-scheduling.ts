import { loadCatalogTranslationSource } from '@pkg/core';
import type { Db } from '@pkg/db';
import { type CatalogTranslationKey, catalogTranslationNeedsAi } from '@pkg/domain';

import type { TranslationMarker } from './translation-scheduler.js';

export async function markCatalogTranslationIfNeeded({
  db,
  key,
  marker,
}: {
  db: Db;
  key: CatalogTranslationKey;
  marker: TranslationMarker;
}): Promise<void> {
  const source = await loadCatalogTranslationSource({ db, key });
  if (source && catalogTranslationNeedsAi(source.state)) marker.mark(key);
}
