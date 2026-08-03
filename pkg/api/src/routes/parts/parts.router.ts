import {
  bulkImportParts,
  createPart,
  getPart,
  getPartBom,
  listPartCategories,
  listPartStorageLocations,
  listParts,
  savePartBom,
  updatePart,
} from '@pkg/core';
import {
  PartBomInput,
  PartBomResult,
  PartBulkImportInput,
  PartCreateInput,
  PartListInput,
  PartUpdateInput,
  SavePartBomInput,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { mapCoreErrors } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';
import { partBomErrorFamily, partCoreErrorFamily } from './part-error-families.js';

export const partsRouter = router({
  list: authorizedProcedure('part:read')
    .input(PartListInput)
    .query(({ ctx, input }) => listParts({ db: ctx.db, input })),

  categories: authorizedProcedure('part:read').query(({ ctx }) => listPartCategories({ db: ctx.db })),

  locations: authorizedProcedure('part:read').query(({ ctx }) => listPartStorageLocations({ db: ctx.db })),

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

  bom: authorizedProcedure('part:read')
    .input(PartBomInput)
    .output(PartBomResult)
    .query(({ ctx, input }) => getPartBom({ db: ctx.db, partId: input.partId })),

  saveBom: authorizedProcedure('part:update')
    .input(SavePartBomInput)
    .output(PartBomResult)
    .mutation(({ ctx, input }) =>
      mapPartErrors(() => savePartBom({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  bulkImport: authorizedProcedure('part:update')
    .input(PartBulkImportInput)
    .mutation(({ ctx, input }) =>
      mapPartErrors(() => bulkImportParts({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),
});

async function mapPartErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapCoreErrors(action, partBomErrorFamily, partCoreErrorFamily);
}
