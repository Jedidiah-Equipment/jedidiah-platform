import { isPartBomError, isPartCoreError, type PartBomError, type PartCoreError } from '@pkg/core';

import { defineCoreErrorFamily } from '../../../trpc/errors.js';

/**
 * The Part boundary's two error families. They live here rather than in the Part router because a
 * build reaches for Parts and their BOMs too, and the inventory boundary must surface those failures
 * with the same codes and the same words — one table, both routers.
 */

export const partBomErrorFamily = defineCoreErrorFamily<PartBomError>({
  codes: {
    'part.bom_component_not_found': 'NOT_FOUND',
    'part.bom_cycle': 'BAD_REQUEST',
    'part.bom_quantity': 'BAD_REQUEST',
    'part.not_built': 'BAD_REQUEST',
  },
  is: isPartBomError,
});

export const partCoreErrorFamily = defineCoreErrorFamily<PartCoreError>({
  codes: {
    'part.bom_locked': 'CONFLICT',
    'part.bulk_import_conflict': 'CONFLICT',
    'part.duplicate_code': 'CONFLICT',
    'part.label_selection_empty': 'NOT_FOUND',
    'part.not_found': 'NOT_FOUND',
    'part.supplier_locked_by_purchase_order': 'CONFLICT',
    'part.supplier_not_found': 'NOT_FOUND',
    'part.unit_of_measure_locked': 'CONFLICT',
  },
  is: isPartCoreError,
  // Only where the core error's own wording is too internal to show a user.
  messages: {
    'part.bulk_import_conflict': 'A CSV row matches an existing part code with a different supplier.',
    'part.duplicate_code': 'A part with this code already exists.',
    'part.label_selection_empty': 'No Parts match this label selection.',
    'part.not_found': 'Part not found.',
    'part.supplier_locked_by_purchase_order': 'Supplier cannot change after the Part is used on a Purchase Order.',
    'part.supplier_not_found': 'Supplier not found.',
    'part.unit_of_measure_locked': 'Unit of Measure cannot change after the Part ledger starts.',
  },
});
