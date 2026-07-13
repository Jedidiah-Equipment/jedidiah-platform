import {
  type AssemblyExportRow,
  createProduct,
  exportProductAssemblies,
  getProduct,
  isProductCoreError,
  listAssemblyNames,
  listProductRangeOptions,
  listProductRangeVariantOptions,
  listProducts,
  type ProductCoreError,
  removeProduct,
  updateProduct,
} from '@pkg/core';
import { ProductCreateInput, ProductListInput, ProductUpdateInput, UUID } from '@pkg/schema';
import { z } from 'zod';

import { log } from '@/logger.js';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const productsRouter = router({
  list: authorizedProcedure('product:read')
    .input(ProductListInput)
    .query(({ ctx, input }) => listProducts({ db: ctx.db, input, log })),

  get: authorizedProcedure('product:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapProductErrors(() => getProduct({ db: ctx.db, id: input.id }))),

  rangeOptions: authorizedProcedure('product:read').query(({ ctx }) => listProductRangeOptions({ db: ctx.db })),

  variantOptions: authorizedProcedure('product:read')
    .input(z.object({ rangeId: UUID }))
    .query(({ ctx, input }) => listProductRangeVariantOptions({ db: ctx.db, rangeId: input.rangeId })),

  assemblyNames: authorizedProcedure('product:read').query(({ ctx }) => listAssemblyNames({ db: ctx.db })),

  assemblyExport: authorizedProcedure('product:read').query(
    ({ ctx }): Promise<AssemblyExportRow[]> => exportProductAssemblies({ db: ctx.db }),
  ),

  create: authorizedProcedure('product:create')
    .input(ProductCreateInput)
    .mutation(({ ctx, input }) =>
      mapProductErrors(() => createProduct({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  update: authorizedProcedure('product:update')
    .input(ProductUpdateInput)
    .mutation(({ ctx, input }) =>
      mapProductErrors(() => updateProduct({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  remove: authorizedProcedure('product:update')
    .input(z.object({ id: UUID }))
    .mutation(({ ctx, input }) =>
      mapProductErrors(() => removeProduct({ db: ctx.db, id: input.id, actorUserId: ctx.session.user.id })),
    ),
});

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
