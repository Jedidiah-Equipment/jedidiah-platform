import { getCatalogTranslationStatus, listCatalogTranslationKeysNeedingTranslation } from '@pkg/core';
import { CatalogTranslationStatus } from '@pkg/schema';

import { authorizedProcedure, router } from '../../trpc/init.js';

export const catalogTranslationsRouter = router({
  translationStatus: authorizedProcedure('product_range:update')
    .output(CatalogTranslationStatus)
    .query(({ ctx }) => getCatalogTranslationStatus({ db: ctx.db })),

  retranslateStale: authorizedProcedure('product_range:update').mutation(async ({ ctx }) => {
    const keys = await listCatalogTranslationKeysNeedingTranslation({ db: ctx.db });
    for (const key of keys) ctx.catalogTranslationScheduler.markNow(key);
    return { queued: keys.length };
  }),
});
