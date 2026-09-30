import { type Db, user } from '@pkg/db';
import { partCategories, partImportBatches, parts } from '@pkg/db/equipment';
import type { PartBulkImportRow, PartLabelPdfModel, PartLabelPdfRenderer } from '@pkg/schema/equipment';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../../test/create-tester.js';
import { bulkImportParts } from './part-bulk-service.js';
import { PartImportBatchNotFoundError, PartLabelSelectionEmptyError } from './part-errors.js';
import { getPartImportBatch, listPartImportBatches } from './part-import-batch-service.js';
import { renderPartLabelBatch } from './part-label-service.js';
import { mergePart } from './part-merge-service.js';

const MISSING_BATCH_ID = '00000000-0000-4000-8000-000000000999';

const test = createTester(async ({ db }) => {
  await createUser(db, 'importer-a', 'Ada Importer');
  await createUser(db, 'importer-b', 'Ben Importer');
  await db.insert(partCategories).values({ name: 'Bearings' });

  return { db };
});

function row(code: string, lineNumber: number, overrides: Partial<PartBulkImportRow> = {}): PartBulkImportRow {
  return {
    category: 'Bearings',
    code,
    description: `${code} description`,
    drawingCode: null,
    finish: 'Zinc',
    isInternallyFabricated: false,
    lineNumber,
    name: `${code} name`,
    supplierCode: `SUP-${code}`,
    supplierName: 'Acme Supplies',
    unitOfMeasure: 'piece',
    ...overrides,
  };
}

/** C and D already exist; the file then creates A/B, updates C, leaves D alone, and rejects E. */
async function importAcceptanceFile(db: Db) {
  await bulkImportParts({ actorUserId: 'importer-a', db, input: { rows: [row('C', 2), row('D', 3)] } });

  return bulkImportParts({
    actorUserId: 'importer-a',
    db,
    input: {
      fileName: 'new-bearings.csv',
      rows: [
        row('A', 2),
        row('B', 3),
        row('C', 4, { name: 'C renamed' }),
        row('D', 5),
        row('E', 6, { category: 'Unknown category' }),
      ],
    },
  });
}

describe('Part Import Batches', () => {
  test('saves each successful row with its outcome, counting rejected rows without keeping them', async ({
    context,
  }) => {
    const result = await importAcceptanceFile(context.db);
    const detail = await getPartImportBatch({ batchId: result.batchId, db: context.db });

    expect(result).toMatchObject({ importedCount: 2, updatedCount: 1 });
    expect(detail.batch).toMatchObject({
      createdCount: 2,
      fileName: 'new-bearings.csv',
      id: result.batchId,
      importedBy: { id: 'importer-a', name: 'Ada Importer' },
      rejectedCount: 1,
      unchangedCount: 1,
      updatedCount: 1,
    });
    expect(detail.members.map((member) => [member.lineNumber, member.importedCode, member.outcome])).toEqual([
      [2, 'A', 'created'],
      [3, 'B', 'created'],
      [4, 'C', 'updated'],
      [5, 'D', 'unchanged'],
    ]);
    expect(detail.labelCounts).toEqual({ created: 2, createdAndUpdated: 3 });
  });

  test('labels only the new Parts by default, adding updated ones when asked', async ({ context }) => {
    const { batchId } = await importAcceptanceFile(context.db);
    const printed = async (includeUpdated: boolean) => {
      const rendered: PartLabelPdfModel[][] = [];
      await renderPartLabelBatch({
        db: context.db,
        pdfRenderer: capturingRenderer(rendered),
        selection: { batchId, includeUpdated, selection: 'importBatch' },
      });
      return rendered.flat().map((label) => label.code);
    };

    expect(await printed(false)).toEqual(['A', 'B']);
    expect(await printed(true)).toEqual(['A', 'B', 'C']);
  });

  test('saves an unchanged re-import as its own batch with nothing new to label', async ({ context }) => {
    const rows = [row('A', 2), row('B', 3)];
    const first = await bulkImportParts({ actorUserId: 'importer-a', db: context.db, input: { rows } });
    const again = await bulkImportParts({ actorUserId: 'importer-a', db: context.db, input: { rows } });
    const detail = await getPartImportBatch({ batchId: again.batchId, db: context.db });

    expect(again.batchId).not.toBe(first.batchId);
    expect(detail.batch).toMatchObject({ createdCount: 0, unchangedCount: 2, updatedCount: 0 });
    expect(detail.labelCounts).toEqual({ created: 0, createdAndUpdated: 0 });
    await expect(
      renderPartLabelBatch({
        db: context.db,
        pdfRenderer: capturingRenderer([]),
        selection: { batchId: again.batchId, includeUpdated: false, selection: 'importBatch' },
      }),
    ).rejects.toBeInstanceOf(PartLabelSelectionEmptyError);
  });

  test('keeps a batch whose every row was rejected', async ({ context }) => {
    const result = await bulkImportParts({
      actorUserId: 'importer-a',
      db: context.db,
      input: { rows: [row('A', 2, { category: 'Unknown category' })] },
    });
    const detail = await getPartImportBatch({ batchId: result.batchId, db: context.db });

    expect(detail.batch).toMatchObject({ createdCount: 0, fileName: null, rejectedCount: 1 });
    expect(detail.members).toEqual([]);
  });

  test('saves nothing when the import fails unexpectedly', async ({ context }) => {
    await expect(
      bulkImportParts({ actorUserId: 'no-such-user', db: context.db, input: { rows: [row('A', 2)] } }),
    ).rejects.toThrow();

    expect(await context.db.$count(parts)).toBe(0);
    expect(await context.db.$count(partImportBatches)).toBe(0);
  });

  test("lists every importer's batches newest first, a page at a time", async ({ context }) => {
    const older = await bulkImportParts({
      actorUserId: 'importer-a',
      db: context.db,
      input: { fileName: 'older.csv', rows: [row('A', 2)] },
    });
    const newer = await bulkImportParts({
      actorUserId: 'importer-b',
      db: context.db,
      input: { fileName: 'newer.csv', rows: [row('B', 2)] },
    });

    const firstPage = await listPartImportBatches({ db: context.db, input: { cursor: 0, limit: 1 } });
    const secondPage = await listPartImportBatches({ db: context.db, input: { cursor: 1, limit: 1 } });

    expect(firstPage).toMatchObject({ nextCursor: 1, total: 2 });
    expect(firstPage.items.map((batch) => [batch.id, batch.importedBy?.name])).toEqual([
      [newer.batchId, 'Ben Importer'],
    ]);
    expect(secondPage).toMatchObject({ nextCursor: null, total: 2 });
    expect(secondPage.items.map((batch) => [batch.id, batch.importedBy?.name])).toEqual([
      [older.batchId, 'Ada Importer'],
    ]);
  });

  test('follows its Parts through edits and merges, dropping ones no longer in the catalog', async ({ context }) => {
    const { batchId } = await bulkImportParts({
      actorUserId: 'importer-a',
      db: context.db,
      input: { rows: [row('A', 2), row('B', 3), row('C', 4)] },
    });
    const idOf = async (code: string) => {
      const [part] = await context.db.select({ id: parts.id }).from(parts).where(eq(parts.code, code));
      if (!part) throw new Error(`Part ${code} missing`);
      return part.id;
    };
    const [a, b, c] = [await idOf('A'), await idOf('B'), await idOf('C')];

    await context.db.update(parts).set({ name: 'B current', storageLocation: 'Bin 7' }).where(eq(parts.id, b));
    await mergePart({ actorUserId: 'importer-a', db: context.db, input: { sourceId: a, targetId: b } });
    await context.db.delete(parts).where(eq(parts.id, c));

    const detail = await getPartImportBatch({ batchId, db: context.db });
    const rendered: PartLabelPdfModel[][] = [];
    await renderPartLabelBatch({
      db: context.db,
      pdfRenderer: capturingRenderer(rendered),
      selection: { batchId, includeUpdated: false, selection: 'importBatch' },
    });

    expect(detail.batch.createdCount).toBe(3);
    expect(detail.members.map((member) => [member.importedCode, member.outcome, member.part?.code ?? null])).toEqual([
      ['A', 'created', 'B'],
      ['B', 'created', 'B'],
      ['C', 'created', null],
    ]);
    expect(detail.labelCounts.created).toBe(1);
    expect(rendered).toEqual([[{ code: 'B', name: 'B current', storageLocation: 'Bin 7' }]]);
  });

  test('refuses a batch that does not exist', async ({ context }) => {
    await expect(getPartImportBatch({ batchId: MISSING_BATCH_ID, db: context.db })).rejects.toBeInstanceOf(
      PartImportBatchNotFoundError,
    );
    await expect(
      renderPartLabelBatch({
        db: context.db,
        pdfRenderer: capturingRenderer([]),
        selection: { batchId: MISSING_BATCH_ID, includeUpdated: false, selection: 'importBatch' },
      }),
    ).rejects.toBeInstanceOf(PartImportBatchNotFoundError);
  });
});

function capturingRenderer(rendered: PartLabelPdfModel[][]): PartLabelPdfRenderer {
  return async ({ document }) => {
    rendered.push(document);
    return new Uint8Array();
  };
}

async function createUser(db: Db, id: string, name: string) {
  const now = new Date();
  await db.insert(user).values({
    createdAt: now,
    email: `${id}@example.com`,
    emailVerified: true,
    id,
    name,
    role: 'admin',
    updatedAt: now,
  });
}
