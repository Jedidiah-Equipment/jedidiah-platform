import {
  bulkExportParts,
  bulkImportParts,
  createPart,
  getPart,
  getPartBom,
  getPartMergePreview,
  listPartCategories,
  listPartStorageLocations,
  listParts,
  mergePart,
  savePartBom,
  updatePart,
} from '@pkg/core/equipment';
import { UUID } from '@pkg/schema';
import {
  PartBomInput,
  PartBomResult,
  PartBulkExportInput,
  type PartBulkExportRow,
  PartBulkImportInput,
  PartCreateInput,
  PartListInput,
  PartMergeInput,
  PartMergePreview,
  PartMergePreviewCostFields,
  PartMergeSideCostFields,
  PartUpdateInput,
  SavePartBomInput,
} from '@pkg/schema/equipment';
import { z } from 'zod';

import { projectInventoryCostFields } from '../../../equipment/trpc/inventory-cost-projection.js';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { partBomErrorFamily, partCoreErrorFamily } from './part-error-families.js';

const partLabelPickerReaders = ['equipment_part:read', 'equipment_inventory:read'] as const;

export const partsRouter = router({
  list: authorizedProcedure('equipment_part:read')
    .input(PartListInput)
    .query(({ ctx, input }) => listParts({ db: ctx.db, input })),

  // Names only, no cost: the price-blind stores role picks its label batches from these.
  categories: authorizedProcedure(partLabelPickerReaders).query(({ ctx }) => listPartCategories({ db: ctx.db })),

  locations: authorizedProcedure(partLabelPickerReaders).query(({ ctx }) => listPartStorageLocations({ db: ctx.db })),

  get: authorizedProcedure('equipment_part:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapPartErrors(() => getPart({ db: ctx.db, id: input.id }))),

  create: authorizedProcedure('equipment_part:update')
    .input(PartCreateInput)
    .mutation(({ ctx, input }) =>
      mapPartErrors(() => createPart({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  update: authorizedProcedure('equipment_part:update')
    .input(PartUpdateInput)
    .mutation(({ ctx, input }) =>
      mapPartErrors(() => updatePart({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  // Stores needs the BOM to post Builds even though the Parts catalogue itself remains hidden.
  bom: authorizedProcedure(['equipment_part:read', 'equipment_inventory:build'])
    .input(PartBomInput)
    .output(PartBomResult)
    .query(({ ctx, input }) => getPartBom({ db: ctx.db, partId: input.partId })),

  saveBom: authorizedProcedure('equipment_part:update')
    .input(SavePartBomInput)
    .output(PartBomResult)
    .mutation(({ ctx, input }) =>
      mapPartErrors(() => savePartBom({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  mergePreview: authorizedProcedure('equipment_part:merge')
    .input(PartMergeInput)
    .output(PartMergePreview)
    .query(async ({ ctx, input }) => {
      const preview = await mapPartErrors(() => getPartMergePreview({ db: ctx.db, input }));
      const projectSide = (side: PartMergePreview['source']) =>
        projectInventoryCostFields({ access: ctx.access, costFields: PartMergeSideCostFields, output: side });

      return {
        ...projectInventoryCostFields({ access: ctx.access, costFields: PartMergePreviewCostFields, output: preview }),
        source: projectSide(preview.source),
        target: projectSide(preview.target),
      };
    }),

  merge: authorizedProcedure('equipment_part:merge')
    .input(PartMergeInput)
    .mutation(({ ctx, input }) =>
      mapPartErrors(() => mergePart({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  bulkImport: authorizedProcedure('equipment_part:update')
    .input(PartBulkImportInput)
    .mutation(({ ctx, input }) =>
      mapPartErrors(() => bulkImportParts({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  // Reading the catalog out, so `equipment_part:read` — the same rows `list` already hands a reader.
  bulkExport: authorizedProcedure('equipment_part:read')
    .input(PartBulkExportInput)
    .query(({ ctx, input }): Promise<PartBulkExportRow[]> => bulkExportParts({ db: ctx.db, input })),
});

async function mapPartErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapCoreErrors(action, partBomErrorFamily, partCoreErrorFamily);
}
