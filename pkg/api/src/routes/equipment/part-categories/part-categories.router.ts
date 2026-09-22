import {
  createPartCategory,
  getPartCategory,
  getPartCategoryMergePreview,
  listManagedPartCategories,
  mergePartCategories,
  updatePartCategory,
} from '@pkg/core/equipment';
import { UUID } from '@pkg/schema';
import { PartCategoryCreateInput, PartCategoryMergeInput, PartCategoryUpdateInput } from '@pkg/schema/equipment';
import { z } from 'zod';

import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, fullyAuthorizedProcedure, router } from '../../../trpc/init.js';
import { partCoreErrorFamily } from '../parts/part-error-families.js';

const MERGE_PERMISSIONS = ['equipment_part_category:update', 'equipment_part_category:merge'] as const;

/**
 * The admin surface sits wholly behind the manage permission, reads included: pickers read names
 * through `parts.categories`, so nothing a Part Category grows later reaches every Part reader.
 */
export const partCategoriesRouter = router({
  list: authorizedProcedure('equipment_part_category:update').query(({ ctx }) =>
    listManagedPartCategories({ db: ctx.db }),
  ),

  get: authorizedProcedure('equipment_part_category:update')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapPartCategoryErrors(() => getPartCategory({ db: ctx.db, id: input.id }))),

  create: authorizedProcedure('equipment_part_category:update')
    .input(PartCategoryCreateInput)
    .mutation(({ ctx, input }) =>
      mapPartCategoryErrors(() => createPartCategory({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  update: authorizedProcedure('equipment_part_category:update')
    .input(PartCategoryUpdateInput)
    .mutation(({ ctx, input }) =>
      mapPartCategoryErrors(() => updatePartCategory({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  // Merging shows and returns markup, which only the manage permission reads.
  mergePreview: fullyAuthorizedProcedure(MERGE_PERMISSIONS)
    .input(PartCategoryMergeInput)
    .query(({ ctx, input }) => mapPartCategoryErrors(() => getPartCategoryMergePreview({ db: ctx.db, input }))),

  merge: fullyAuthorizedProcedure(MERGE_PERMISSIONS)
    .input(PartCategoryMergeInput)
    .mutation(({ ctx, input }) =>
      mapPartCategoryErrors(() => mergePartCategories({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),
});

async function mapPartCategoryErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapCoreErrors(action, partCoreErrorFamily);
}
