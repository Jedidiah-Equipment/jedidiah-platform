import {
  getCatalogProductRangeTranslation,
  getCatalogProductTranslation,
  getCatalogTranslationStatus,
  listCatalogTranslationKeysNeedingTranslation,
  listCatalogTranslationsNeedingReview,
  ProductNotFoundError,
  ProductRangeNotFoundError,
  patchCatalogProductRangeTranslation,
  patchCatalogProductTranslation,
} from '@pkg/core/equipment';
import type { CatalogTranslationKey } from '@pkg/domain/equipment';
import { UUID } from '@pkg/schema';
import {
  CatalogProductRangeTranslation,
  CatalogProductRangeTranslationPatchInput,
  CatalogProductTranslation,
  CatalogProductTranslationPatchInput,
  CatalogTranslationNeedsReviewList,
  CatalogTranslationStatus,
} from '@pkg/schema/equipment';
import { z } from 'zod';

import type { TranslationMarker } from '../../../equipment/catalog-translations/translation-scheduler.js';
import { type CoreErrorMapping, mapKnownCoreError } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';

export function createCatalogTranslationsRouter(catalogTranslationScheduler: TranslationMarker) {
  return router({
    getProduct: authorizedProcedure('equipment_product:update')
      .input(z.object({ id: UUID }))
      .output(CatalogProductTranslation)
      .query(async ({ ctx, input }) =>
        mapCatalogTranslationErrors(() => getCatalogProductTranslation({ db: ctx.db, id: input.id })),
      ),

    updateProduct: authorizedProcedure('equipment_product:update')
      .input(CatalogProductTranslationPatchInput)
      .output(CatalogProductTranslation)
      .mutation(async ({ ctx, input }) =>
        patchAndRequeue(catalogTranslationScheduler, () => patchCatalogProductTranslation({ db: ctx.db, input })),
      ),

    getRange: authorizedProcedure('equipment_product_range:update')
      .input(z.object({ id: UUID }))
      .output(CatalogProductRangeTranslation)
      .query(async ({ ctx, input }) =>
        mapCatalogTranslationErrors(() => getCatalogProductRangeTranslation({ db: ctx.db, id: input.id })),
      ),

    updateRange: authorizedProcedure('equipment_product_range:update')
      .input(CatalogProductRangeTranslationPatchInput)
      .output(CatalogProductRangeTranslation)
      .mutation(async ({ ctx, input }) =>
        patchAndRequeue(catalogTranslationScheduler, () => patchCatalogProductRangeTranslation({ db: ctx.db, input })),
      ),

    translationStatus: authorizedProcedure('equipment_product_range:update')
      .output(CatalogTranslationStatus)
      .query(({ ctx }) => getCatalogTranslationStatus({ db: ctx.db })),

    listNeedsReview: authorizedProcedure('equipment_product_range:update')
      .output(CatalogTranslationNeedsReviewList)
      .query(({ ctx }) => listCatalogTranslationsNeedingReview({ db: ctx.db })),

    retranslateStale: authorizedProcedure('equipment_product_range:update').mutation(async ({ ctx }) => {
      const keys = await listCatalogTranslationKeysNeedingTranslation({ db: ctx.db });
      for (const key of keys) catalogTranslationScheduler.markNow(key);
      return { queued: keys.length };
    }),
  });
}

// A field handed back to the AI is left with no value, so its translation unit is queued immediately
// rather than waiting for the scheduler's debounce.
async function patchAndRequeue<Translation>(
  scheduler: TranslationMarker,
  patch: () => Promise<{ requeueKeys: CatalogTranslationKey[]; translation: Translation }>,
): Promise<Translation> {
  const result = await mapCatalogTranslationErrors(patch);
  for (const key of result.requeueKeys) scheduler.markNow(key);
  return result.translation;
}

function mapCatalogTranslationErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(
    action,
    isCatalogTranslationTargetMissing,
    (error) => catalogTranslationErrorMappings[error.code],
  );
}

function isCatalogTranslationTargetMissing(error: unknown): error is ProductNotFoundError | ProductRangeNotFoundError {
  return error instanceof ProductNotFoundError || error instanceof ProductRangeNotFoundError;
}

const catalogTranslationErrorMappings = {
  'product.not_found': {
    appCode: 'product.not_found',
    code: 'NOT_FOUND',
    message: 'Product not found.',
  },
  'product_range.not_found': {
    appCode: 'product_range.not_found',
    code: 'NOT_FOUND',
    message: 'Product Range not found.',
  },
} satisfies {
  [TCode in (ProductNotFoundError | ProductRangeNotFoundError)['code']]: CoreErrorMapping<TCode>;
};
