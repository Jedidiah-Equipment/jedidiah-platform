import { z } from 'zod';

import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { CursorQueryInput, createCursorQueryResult } from '../../common/pagination.js';
import { UUID } from '../../common/uuid.js';
import { PartCode, PartImportFileName, PartName, PartStorageLocation } from './part.js';

/**
 * What one successful CSV row did to its Part. A rejected row changed nothing and names no Part it
 * is sure of, so it is only ever counted, never a member.
 */
export type PartImportBatchOutcome = z.infer<typeof PartImportBatchOutcome>;
export const PartImportBatchOutcome = z.enum(['created', 'updated', 'unchanged']);

export const PART_IMPORT_BATCH_OUTCOME_LABELS = {
  created: 'New',
  unchanged: 'Unchanged',
  updated: 'Updated',
} as const satisfies Record<PartImportBatchOutcome, string>;

/** Who ran an import. Only a name: history is shared, and contact details are not this workflow's. */
export type PartImportBatchImporter = z.infer<typeof PartImportBatchImporter>;
export const PartImportBatchImporter = z.object({ id: AuthId, name: z.string() });

export type PartImportBatch = z.infer<typeof PartImportBatch>;
export const PartImportBatch = z.object({
  completedAt: DateIso,
  createdCount: z.number().int().nonnegative(),
  fileName: PartImportFileName.nullable(),
  id: UUID,
  /** Null once the importing User is removed; the batch outlives them. */
  importedBy: PartImportBatchImporter.nullable(),
  rejectedCount: z.number().int().nonnegative(),
  unchangedCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
});

export type PartImportBatchListInput = z.infer<typeof PartImportBatchListInput>;
export const PartImportBatchListInput = CursorQueryInput;

export type PartImportBatchListResult = z.infer<typeof PartImportBatchListResult>;
export const PartImportBatchListResult = createCursorQueryResult(PartImportBatch);

export type PartImportBatchInput = z.infer<typeof PartImportBatchInput>;
export const PartImportBatchInput = z.object({ batchId: UUID });

/** A Part as it stands now — the label prints these details, not the ones imported. */
export type PartImportBatchCurrentPart = z.infer<typeof PartImportBatchCurrentPart>;
export const PartImportBatchCurrentPart = z.object({
  code: PartCode,
  id: UUID,
  name: PartName,
  storageLocation: PartStorageLocation,
});

export type PartImportBatchMember = z.infer<typeof PartImportBatchMember>;
export const PartImportBatchMember = z.object({
  /** The Part Code and name as the row imported them, kept even after the Part is renamed or merged. */
  importedCode: PartCode,
  importedName: PartName,
  lineNumber: z.number().int().min(1),
  outcome: PartImportBatchOutcome,
  /** Null when the Part is no longer in the catalog; such a member prints no label. */
  part: PartImportBatchCurrentPart.nullable(),
});

export type PartImportBatchDetail = z.infer<typeof PartImportBatchDetail>;
export const PartImportBatchDetail = z.object({
  batch: PartImportBatch,
  /** Distinct current Parts each label selection prints, after merges and removals. */
  labelCounts: z.object({
    created: z.number().int().nonnegative(),
    createdAndUpdated: z.number().int().nonnegative(),
  }),
  members: z.array(PartImportBatchMember),
});
