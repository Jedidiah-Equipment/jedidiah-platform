import {
  createProductRange,
  createProductRangeVariant,
  getCatalogTranslationStatus,
  getProductRange,
  isProductRangeCoreError,
  listCatalogTranslationKeysNeedingTranslation,
  listProductRanges,
  type ProductRangeCoreError,
  removeProductRange,
  removeProductRangeVariant,
  reorderProductRanges,
  reorderProductRangeVariants,
  updateProductRange,
  updateProductRangeVariant,
} from '@pkg/core';
import {
  CatalogTranslationStatus,
  ProductRangeCreateInput,
  ProductRangeReorderInput,
  ProductRangeUpdateInput,
  ProductRangeVariantCreateInput,
  ProductRangeVariantReorderInput,
  ProductRangeVariantUpdateInput,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const productRangesRouter = router({
  list: authorizedProcedure('product_range:read').query(({ ctx }) => listProductRanges({ db: ctx.db })),

  translationStatus: authorizedProcedure('product_range:update')
    .output(CatalogTranslationStatus)
    .query(({ ctx }) => getCatalogTranslationStatus({ db: ctx.db })),

  retranslateStale: authorizedProcedure('product_range:update').mutation(async ({ ctx }) => {
    const keys = await listCatalogTranslationKeysNeedingTranslation({ db: ctx.db });
    for (const key of keys) ctx.catalogTranslationScheduler.mark(key);
    return { queued: keys.length };
  }),

  get: authorizedProcedure('product_range:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapProductRangeErrors(() => getProductRange({ db: ctx.db, id: input.id }))),

  create: authorizedProcedure('product_range:create')
    .input(ProductRangeCreateInput)
    .mutation(async ({ ctx, input }) => {
      const range = await mapProductRangeErrors(() => createProductRange({ db: ctx.db, input }));
      ctx.catalogTranslationScheduler.mark(`product_range:${range.id}`);
      return range;
    }),

  update: authorizedProcedure('product_range:update')
    .input(ProductRangeUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const range = await mapProductRangeErrors(() => updateProductRange({ db: ctx.db, input }));
      ctx.catalogTranslationScheduler.mark(`product_range:${range.id}`);
      return range;
    }),

  remove: authorizedProcedure('product_range:update')
    .input(z.object({ id: UUID }))
    .mutation(({ ctx, input }) => mapProductRangeErrors(() => removeProductRange({ db: ctx.db, id: input.id }))),

  reorder: authorizedProcedure('product_range:update')
    .input(ProductRangeReorderInput)
    .mutation(({ ctx, input }) => mapProductRangeErrors(() => reorderProductRanges({ db: ctx.db, input }))),

  createVariant: authorizedProcedure('product_range:update')
    .input(ProductRangeVariantCreateInput)
    .mutation(async ({ ctx, input }) => {
      const variant = await mapProductRangeErrors(() => createProductRangeVariant({ db: ctx.db, input }));
      ctx.catalogTranslationScheduler.mark(`product_range_variant:${variant.id}`);
      return variant;
    }),

  updateVariant: authorizedProcedure('product_range:update')
    .input(ProductRangeVariantUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const variant = await mapProductRangeErrors(() => updateProductRangeVariant({ db: ctx.db, input }));
      ctx.catalogTranslationScheduler.mark(`product_range_variant:${variant.id}`);
      return variant;
    }),

  removeVariant: authorizedProcedure('product_range:update')
    .input(z.object({ id: UUID, rangeId: UUID }))
    .mutation(({ ctx, input }) =>
      mapProductRangeErrors(() => removeProductRangeVariant({ db: ctx.db, id: input.id, rangeId: input.rangeId })),
    ),

  reorderVariants: authorizedProcedure('product_range:update')
    .input(ProductRangeVariantReorderInput)
    .mutation(({ ctx, input }) => mapProductRangeErrors(() => reorderProductRangeVariants({ db: ctx.db, input }))),
});

async function mapProductRangeErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isProductRangeCoreError, mapProductRangeCoreError);
}

function mapProductRangeCoreError(error: ProductRangeCoreError): CoreErrorMapping<ProductRangeCoreError['code']> {
  return productRangeErrorMappings[error.code];
}

const productRangeErrorMappings = {
  'product_range.duplicate_name': {
    appCode: 'product_range.duplicate_name',
    code: 'CONFLICT',
    message: 'A Product Range with this name already exists.',
  },
  'product_range.not_found': {
    appCode: 'product_range.not_found',
    code: 'NOT_FOUND',
    message: 'Product Range not found.',
  },
  'product_range.has_products': {
    appCode: 'product_range.has_products',
    code: 'CONFLICT',
    message: 'Product Range has active linked products and cannot be removed.',
  },
  'product_range.variant_duplicate_name': {
    appCode: 'product_range.variant_duplicate_name',
    code: 'CONFLICT',
    message: 'A Variant with this name already exists for this Product Range.',
  },
  'product_range.variant_has_products': {
    appCode: 'product_range.variant_has_products',
    code: 'CONFLICT',
    message: 'Product Range Variant has active linked products and cannot be removed.',
  },
  'product_range.variant_not_found': {
    appCode: 'product_range.variant_not_found',
    code: 'NOT_FOUND',
    message: 'Product Range Variant not found.',
  },
} satisfies {
  [TCode in ProductRangeCoreError['code']]: CoreErrorMapping<TCode>;
};
