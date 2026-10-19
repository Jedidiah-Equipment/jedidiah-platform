import {
  createProductRange,
  createProductRangeVariant,
  getProductRange,
  listProductRanges,
  removeProductRange,
  removeProductRangeVariant,
  reorderProductRanges,
  reorderProductRangeVariants,
  updateProductRange,
  updateProductRangeVariant,
} from '@pkg/core/equipment';
import { catalogTranslationKey } from '@pkg/domain/equipment';
import { UUID } from '@pkg/schema';
import {
  ProductRangeCreateInput,
  ProductRangeReorderInput,
  ProductRangeUpdateInput,
  ProductRangeVariantCreateInput,
  ProductRangeVariantReorderInput,
  ProductRangeVariantUpdateInput,
} from '@pkg/schema/equipment';
import { z } from 'zod';
import type { TranslationMarker } from '../../../equipment/catalog-translations/translation-scheduler.js';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { productRangeErrorFamily } from '../equipment-error-families.js';

export function createProductRangesRouter(catalogTranslationScheduler: TranslationMarker) {
  return router({
    list: authorizedProcedure('equipment_product_range:read').query(({ ctx }) => listProductRanges({ db: ctx.db })),

    get: authorizedProcedure('equipment_product_range:read')
      .input(z.object({ id: UUID }))
      .query(({ ctx, input }) =>
        mapCoreErrors(() => getProductRange({ db: ctx.db, id: input.id }), productRangeErrorFamily),
      ),

    create: authorizedProcedure('equipment_product_range:create')
      .input(ProductRangeCreateInput)
      .mutation(async ({ ctx, input }) => {
        const range = await mapCoreErrors(() => createProductRange({ db: ctx.db, input }), productRangeErrorFamily);
        catalogTranslationScheduler.mark(catalogTranslationKey('range', range.id));
        return range;
      }),

    update: authorizedProcedure('equipment_product_range:update')
      .input(ProductRangeUpdateInput)
      .mutation(async ({ ctx, input }) => {
        const range = await mapCoreErrors(() => updateProductRange({ db: ctx.db, input }), productRangeErrorFamily);
        catalogTranslationScheduler.mark(catalogTranslationKey('range', range.id));
        return range;
      }),

    remove: authorizedProcedure('equipment_product_range:update')
      .input(z.object({ id: UUID }))
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => removeProductRange({ db: ctx.db, id: input.id }), productRangeErrorFamily),
      ),

    reorder: authorizedProcedure('equipment_product_range:update')
      .input(ProductRangeReorderInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => reorderProductRanges({ db: ctx.db, input }), productRangeErrorFamily),
      ),

    createVariant: authorizedProcedure('equipment_product_range:update')
      .input(ProductRangeVariantCreateInput)
      .mutation(async ({ ctx, input }) => {
        const variant = await mapCoreErrors(
          () => createProductRangeVariant({ db: ctx.db, input }),
          productRangeErrorFamily,
        );
        catalogTranslationScheduler.mark(catalogTranslationKey('variant', variant.id));
        return variant;
      }),

    updateVariant: authorizedProcedure('equipment_product_range:update')
      .input(ProductRangeVariantUpdateInput)
      .mutation(async ({ ctx, input }) => {
        const variant = await mapCoreErrors(
          () => updateProductRangeVariant({ db: ctx.db, input }),
          productRangeErrorFamily,
        );
        catalogTranslationScheduler.mark(catalogTranslationKey('variant', variant.id));
        return variant;
      }),

    removeVariant: authorizedProcedure('equipment_product_range:update')
      .input(z.object({ id: UUID, rangeId: UUID }))
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => removeProductRangeVariant({ db: ctx.db, id: input.id, rangeId: input.rangeId }),
          productRangeErrorFamily,
        ),
      ),

    reorderVariants: authorizedProcedure('equipment_product_range:update')
      .input(ProductRangeVariantReorderInput)
      .mutation(({ ctx, input }) =>
        mapCoreErrors(() => reorderProductRangeVariants({ db: ctx.db, input }), productRangeErrorFamily),
      ),
  });
}
