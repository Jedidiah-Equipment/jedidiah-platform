import {
  bulkImportParts,
  createPart,
  getPart,
  isPartCoreError,
  listPartCategories,
  listParts,
  type PartCoreError,
  updatePart,
} from '@pkg/core';
import { PartBulkImportInput, PartCreateInput, PartListInput, PartUpdateInput, UUID } from '@pkg/schema';
import { z } from 'zod';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const partsRouter = router({
  list: authorizedProcedure('part:read')
    .input(PartListInput)
    .query(({ ctx, input }) => listParts({ db: ctx.db, input })),

  categories: authorizedProcedure('part:read').query(({ ctx }) => listPartCategories({ db: ctx.db })),

  get: authorizedProcedure('part:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapPartErrors(() => getPart({ db: ctx.db, id: input.id }))),

  create: authorizedProcedure('part:update')
    .input(PartCreateInput)
    .mutation(({ ctx, input }) =>
      mapPartErrors(() => createPart({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  update: authorizedProcedure('part:update')
    .input(PartUpdateInput)
    .mutation(({ ctx, input }) =>
      mapPartErrors(() => updatePart({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  bulkImport: authorizedProcedure('part:update')
    .input(PartBulkImportInput)
    .mutation(({ ctx, input }) =>
      mapPartErrors(() => bulkImportParts({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),
});

async function mapPartErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isPartCoreError, mapPartCoreError);
}

function mapPartCoreError(error: PartCoreError): CoreErrorMapping<PartCoreError['code']> {
  switch (error.code) {
    case 'part.duplicate_code':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: 'A part with this code already exists.',
      };
    case 'part.duplicate_supplier_code':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: 'A part with this supplier code already exists for this supplier.',
      };
    case 'part.bulk_import_conflict':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: 'A CSV row matches an existing part code with a different supplier or supplier code.',
      };
    case 'part.not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Part not found.',
      };
    case 'part.supplier_not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Supplier not found.',
      };
    default:
      return assertNever(error);
  }
}
