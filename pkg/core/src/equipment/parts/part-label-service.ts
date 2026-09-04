import type { Db } from '@pkg/db';
import { parts } from '@pkg/db/equipment';
import type { UUID } from '@pkg/schema';
import {
  type PartLabelBatchSelection,
  type PartLabelPdfModel,
  PartLabelPdfModel as PartLabelPdfModelSchema,
  type PartLabelPdfRenderer,
} from '@pkg/schema/equipment';
import { asc, eq, inArray, type SQL } from 'drizzle-orm';

import { PartLabelSelectionEmptyError, PartNotFoundError } from './part-errors.js';

export type PartLabelPdfResult = {
  bytes: Uint8Array;
  filename: string;
};

export async function renderPartLabel({
  db,
  id,
  pdfRenderer,
}: {
  db: Db;
  id: UUID;
  pdfRenderer: PartLabelPdfRenderer;
}): Promise<PartLabelPdfResult> {
  const labels = await listLabelModels({ db, selection: { ids: [id], selection: 'ids' } });
  const label = labels[0];

  if (!label) {
    throw new PartNotFoundError(id);
  }

  const filename = `${label.code}-label.pdf`;
  return { bytes: await pdfRenderer({ document: [label], filename }), filename };
}

export async function renderPartLabelBatch({
  db,
  pdfRenderer,
  selection,
}: {
  db: Db;
  pdfRenderer: PartLabelPdfRenderer;
  selection: PartLabelBatchSelection;
}): Promise<PartLabelPdfResult> {
  const labels = await listLabelModels({ db, selection });

  if (labels.length === 0) {
    throw new PartLabelSelectionEmptyError();
  }

  const filename = 'part-labels.pdf';
  return { bytes: await pdfRenderer({ document: labels, filename }), filename };
}

/**
 * A label is a Part's own identity — its code, name, and Storage Location — so it is never scoped by
 * Supplier. Joining one in would silently drop a Part whose Supplier was retired, and every Built
 * Part once `parts.supplierId` goes nullable (spec §6); the go-live batch is where a missing label hurts.
 */
async function listLabelModels({
  db,
  selection,
}: {
  db: Db;
  selection: PartLabelBatchSelection;
}): Promise<PartLabelPdfModel[]> {
  const rows = await db
    .select({ code: parts.code, id: parts.id, name: parts.name, storageLocation: parts.storageLocation })
    .from(parts)
    .where(getSelectionCondition(selection))
    .orderBy(asc(parts.code));

  const copiesByPartId =
    selection.selection === 'copies' ? new Map(selection.copies.map((copy) => [copy.partId, copy.copies])) : null;

  return rows.flatMap((row) => {
    const model = PartLabelPdfModelSchema.parse(row);
    return Array.from({ length: copiesByPartId?.get(row.id) ?? 1 }, () => model);
  });
}

function getSelectionCondition(selection: PartLabelBatchSelection): SQL | undefined {
  switch (selection.selection) {
    case 'all':
      return undefined;
    case 'category':
      return eq(parts.category, selection.category);
    case 'storageLocation':
      return eq(parts.storageLocation, selection.storageLocation);
    case 'ids':
      return inArray(parts.id, selection.ids);
    case 'copies':
      return inArray(
        parts.id,
        selection.copies.map((copy) => copy.partId),
      );
  }
}
