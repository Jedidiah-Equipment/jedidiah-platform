import {
  type AssemblyExportRow,
  createProduct,
  exportProductAssemblies,
  getProduct,
  getProductBuildMetrics,
  getProductCostEstimate,
  isProductCoreError,
  listAssemblyNames,
  listProductRangeOptions,
  listProductRangeVariantOptions,
  listProducts,
  type ProductCoreError,
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
import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';

export function createProductsRouter(catalogTranslationScheduler: TranslationMarker) {
  return router({
    list: authorizedProcedure('equipment_product:read')
      .input(ProductListInput)
      .query(({ ctx, input }) => listProducts({ db: ctx.db, input, log })),

    get: authorizedProcedure('equipment_product:read')
      .input(z.object({ id: UUID }))
      .query(({ ctx, input }) => mapProductErrors(() => getProduct({ db: ctx.db, id: input.id }))),

    costEstimate: authorizedProcedure('equipment_inventory_cost:read')
      .input(z.object({ productId: UUID }).strict())
      .output(ProductCostEstimate)
      .query(({ ctx, input }) =>
        mapProductErrors(() => getProductCostEstimate({ db: ctx.db, productId: input.productId })),
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
        const product = await mapProductErrors(() =>
          createProduct({ db: ctx.db, input, actorUserId: ctx.session.user.id }),
        );
        catalogTranslationScheduler.mark(catalogTranslationKey('product', product.id));
        return product;
      }),

    update: authorizedProcedure('equipment_product:update')
      .input(ProductUpdateInput)
      .mutation(async ({ ctx, input }) => {
        const product = await mapProductErrors(() =>
          updateProduct({ db: ctx.db, input, actorUserId: ctx.session.user.id }),
        );
        catalogTranslationScheduler.mark(catalogTranslationKey('product', product.id));
        return product;
      }),

    remove: authorizedProcedure('equipment_product:update')
      .input(z.object({ id: UUID }))
      .mutation(({ ctx, input }) =>
        mapProductErrors(() => removeProduct({ db: ctx.db, id: input.id, actorUserId: ctx.session.user.id })),
      ),
  });
}

async function mapProductErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isProductCoreError, mapProductCoreError);
}

function mapProductCoreError(error: ProductCoreError): CoreErrorMapping<ProductCoreError['code']> {
  switch (error.code) {
    case 'product.assembly.duplicate_name':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: 'Assembly names must be unique within a product.',
      };
    case 'product.assembly.duplicate_part':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: 'A part can only be added once per assembly.',
      };
    case 'product.assembly.kind_changed':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: 'An existing assembly cannot change between standard and optional.',
      };
    case 'product.assembly.override_target_not_found':
    case 'product.assembly.override_target_wrong_kind':
    case 'product.assembly.override_target_wrong_product':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: 'Assembly overrides must target standard assemblies on the same product.',
      };
    case 'product.assembly.wrong_product':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: 'Assemblies must belong to the product being updated.',
      };
    case 'product.bay.disabled':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: 'Only enabled Bays can be added to Product Bays.',
      };
    case 'product.bay.duplicate':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: 'A Bay can only be added once per Product.',
      };
    case 'product.bay.not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Bay not found.',
      };
    case 'product.brochure_incomplete':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: 'Complete the required brochure fields before previewing the brochure.',
      };
    case 'product.duplicate_name':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: 'A product with this name already exists.',
      };
    case 'product.duplicate_model_code':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: 'A product with this model code already exists.',
      };
    case 'product.not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Product not found.',
      };
    case 'product.material_part.invalid':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: 'Product raw materials must use periodic stock tracking.',
      };
    case 'product.range.not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Product Range not found.',
      };
    case 'product.variant.not_found':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: 'Product Range Variant not found for this Product Range.',
      };
    default:
      return assertNever(error);
  }
}
