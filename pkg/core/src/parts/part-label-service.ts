import type { Db } from '@pkg/db';
import { parts, supplier } from '@pkg/db';
import {
  type PartLabelBatchSelection,
  type PartLabelPdfModel,
  PartLabelPdfModel as PartLabelPdfModelSchema,
  type PartLabelPdfRenderer,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';

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

async function listLabelModels({
  db,
  selection,
}: {
  db: Db;
  selection: PartLabelBatchSelection;
}): Promise<PartLabelPdfModel[]> {
  const selectionCondition = getSelectionCondition(selection);
  const rows = await db
    .select({ code: parts.code, name: parts.name, storageLocation: parts.storageLocation })
    .from(parts)
    .innerJoin(supplier, eq(parts.supplierId, supplier.id))
    .where(and(isNull(supplier.deletedAt), selectionCondition))
    .orderBy(asc(parts.code));

  return rows.map((row) => PartLabelPdfModelSchema.parse(row));
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
  }
}
