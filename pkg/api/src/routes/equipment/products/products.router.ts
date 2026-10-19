import {
  type AssemblyExportRow,
  createProduct,
  exportProductAssemblies,
  getProduct,
  getProductBuildMetrics,
  getProductCostEstimate,
  listAssemblyNames,
  listProductRangeOptions,
  listProductRangeVariantOptions,
  listProducts,
  removeProduct,
  updateProduct,
} from '@pkg/core/equipment';
import { hasPermission } from '@pkg/domain';
import { catalogTranslationKey } from '@pkg/domain/equipment';
import { UUID } from '@pkg/schema';
import {
  ProductBuildMetricsInput,
  ProductCostEstimate,
  ProductCreateInput,
  ProductListInput,
  ProductUpdateInput,
} from '@pkg/schema/equipment';
import { z } from 'zod';
import { log } from '@/logger.js';

import type { TranslationMarker } from '../../../equipment/catalog-translations/translation-scheduler.js';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { productErrorFamily } from '../equipment-error-families.js';

export function createProductsRouter(catalogTranslationScheduler: TranslationMarker) {
  return router({
    list: authorizedProcedure('equipment_product:read')
      .input(ProductListInput)
      .query(({ ctx, input }) => listProducts({ db: ctx.db, input, log })),

    get: authorizedProcedure('equipment_product:read')
      .input(z.object({ id: UUID }))
      .query(({ ctx, input }) => mapCoreErrors(() => getProduct({ db: ctx.db, id: input.id }), productErrorFamily)),

    costEstimate: authorizedProcedure('equipment_inventory_cost:read')
      .input(z.object({ productId: UUID }).strict())
      .output(ProductCostEstimate)
      .query(({ ctx, input }) =>
        mapCoreErrors(() => getProductCostEstimate({ db: ctx.db, productId: input.productId }), productErrorFamily),
      ),

    /**
     * The average is catalog information under `equipment_product:read`; the ranking is performance data about
     * named people, so it rides the same payload but only for `equipment_job_metrics:read` holders. Partial
     * response rather than a second procedure: one screen, one query, the gate decides one field.
     */
    buildMetrics: authorizedProcedure('equipment_product:read')
      .input(ProductBuildMetricsInput)
      .query(({ ctx, input }) =>
        getProductBuildMetrics({
          db: ctx.db,
          includeRanking: hasPermission(ctx.access, 'equipment_job_metrics:read'),
          input,
        }),
      ),

    rangeOptions: authorizedProcedure('equipment_product:read').query(({ ctx }) =>
      listProductRangeOptions({ db: ctx.db }),
    ),

    variantOptions: authorizedProcedure('equipment_product:read')
      .input(z.object({ rangeId: UUID }))
      .query(({ ctx, input }) => listProductRangeVariantOptions({ db: ctx.db, rangeId: input.rangeId })),

    assemblyNames: authorizedProcedure('equipment_product:read').query(({ ctx }) => listAssemblyNames({ db: ctx.db })),

    assemblyExport: authorizedProcedure('equipment_product:read').query(
      ({ ctx }): Promise<AssemblyExportRow[]> => exportProductAssemblies({ db: ctx.db }),
    ),

    create: authorizedProcedure('equipment_product:create')
      .input(ProductCreateInput)
      .mutation(async ({ ctx, input }) => {
        const product = await mapCoreErrors(
          () => createProduct({ db: ctx.db, input, actorUserId: ctx.session.user.id }),
          productErrorFamily,
        );
        catalogTranslationScheduler.mark(catalogTranslationKey('product', product.id));
        return product;
      }),

    update: authorizedProcedure('equipment_product:update')
      .input(ProductUpdateInput)
      .mutation(async ({ ctx, input }) => {
        const product = await mapCoreErrors(
          () => updateProduct({ db: ctx.db, input, actorUserId: ctx.session.user.id }),
          productErrorFamily,
        );
        catalogTranslationScheduler.mark(catalogTranslationKey('product', product.id));
        return product;
      }),

    remove: authorizedProcedure('equipment_product:update')
      .input(z.object({ id: UUID }))
      .mutation(({ ctx, input }) =>
        mapCoreErrors(
          () => removeProduct({ db: ctx.db, id: input.id, actorUserId: ctx.session.user.id }),
          productErrorFamily,
        ),
      ),
  });
}
