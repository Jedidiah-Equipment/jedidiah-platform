import {
  type CatalogTranslationCoreError,
  getCatalogProductRangeTranslation,
  getCatalogProductRangeVariantTranslation,
  getCatalogProductTranslation,
  getCatalogTranslationStatus,
  isCatalogTranslationCoreError,
  listCatalogTranslationKeysNeedingTranslation,
  patchCatalogProductRangeTranslation,
  patchCatalogProductRangeVariantTranslation,
  patchCatalogProductTranslation,
} from '@pkg/core';
import { catalogTranslationKey } from '@pkg/domain';
import {
  CatalogProductRangeTranslation,
  CatalogProductRangeTranslationPatchInput,
  CatalogProductRangeVariantTranslation,
  CatalogProductRangeVariantTranslationPatchInput,
  CatalogProductTranslation,
  CatalogProductTranslationPatchInput,
  CatalogTranslationStatus,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const catalogTranslationsRouter = router({
  getProduct: authorizedProcedure('product:update')
    .input(z.object({ id: UUID }))
    .output(CatalogProductTranslation)
    .query(async ({ ctx, input }) =>
      mapCatalogTranslationErrors(() => getCatalogProductTranslation({ db: ctx.db, id: input.id })),
    ),

  updateProduct: authorizedProcedure('product:update')
    .input(CatalogProductTranslationPatchInput)
    .output(CatalogProductTranslation)
    .mutation(async ({ ctx, input }) => {
      const result = await mapCatalogTranslationErrors(() => patchCatalogProductTranslation({ db: ctx.db, input }));
      if (result.requeue) ctx.catalogTranslationScheduler.markNow(catalogTranslationKey('product', input.id));
      return result.translation;
    }),

  getRange: authorizedProcedure('product_range:update')
    .input(z.object({ id: UUID }))
    .output(CatalogProductRangeTranslation)
    .query(async ({ ctx, input }) =>
      mapCatalogTranslationErrors(() => getCatalogProductRangeTranslation({ db: ctx.db, id: input.id })),
    ),

  updateRange: authorizedProcedure('product_range:update')
    .input(CatalogProductRangeTranslationPatchInput)
    .output(CatalogProductRangeTranslation)
    .mutation(async ({ ctx, input }) => {
      const result = await mapCatalogTranslationErrors(() =>
        patchCatalogProductRangeTranslation({ db: ctx.db, input }),
      );
      if (result.requeue) ctx.catalogTranslationScheduler.markNow(catalogTranslationKey('range', input.id));
      return result.translation;
    }),

  getVariant: authorizedProcedure('product_range:update')
    .input(z.object({ id: UUID }))
    .output(CatalogProductRangeVariantTranslation)
    .query(async ({ ctx, input }) =>
      mapCatalogTranslationErrors(() => getCatalogProductRangeVariantTranslation({ db: ctx.db, id: input.id })),
    ),

  updateVariant: authorizedProcedure('product_range:update')
    .input(CatalogProductRangeVariantTranslationPatchInput)
    .output(CatalogProductRangeVariantTranslation)
    .mutation(async ({ ctx, input }) => {
      const result = await mapCatalogTranslationErrors(() =>
        patchCatalogProductRangeVariantTranslation({ db: ctx.db, input }),
      );
      if (result.requeue) ctx.catalogTranslationScheduler.markNow(catalogTranslationKey('variant', input.id));
      return result.translation;
    }),

  translationStatus: authorizedProcedure('product_range:update')
    .output(CatalogTranslationStatus)
    .query(({ ctx }) => getCatalogTranslationStatus({ db: ctx.db })),

  retranslateStale: authorizedProcedure('product_range:update').mutation(async ({ ctx }) => {
    const keys = await listCatalogTranslationKeysNeedingTranslation({ db: ctx.db });
    for (const key of keys) ctx.catalogTranslationScheduler.markNow(key);
    return { queued: keys.length };
  }),
});

function mapCatalogTranslationErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(
    action,
    isCatalogTranslationCoreError,
    (error) => catalogTranslationErrorMappings[error.code],
  );
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
  'product_range.variant_not_found': {
    appCode: 'product_range.variant_not_found',
    code: 'NOT_FOUND',
    message: 'Product Range Variant not found.',
  },
} satisfies {
  [TCode in CatalogTranslationCoreError['code']]: CoreErrorMapping<TCode>;
};
