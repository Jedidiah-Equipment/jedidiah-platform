import {
  type DatabaseTransaction,
  type Db,
  productAssemblies,
  quoteSelectedAssemblies,
} from '@pkg/db';
import { type QuoteCreateInput, QuoteSelectedAssembly, type UUID } from '@pkg/schema';
import { asc, eq, inArray } from 'drizzle-orm';

import { QuoteInvalidReferenceError } from './quote-errors.js';

export type QuoteSelectedAssemblyRow = typeof quoteSelectedAssemblies.$inferSelect;

export type ResolvedQuoteSelectedAssemblies = {
  newRows: QuoteSelectedAssemblyRow[];
  removeIds: UUID[];
  rows: QuoteSelectedAssemblyRow[];
};

export function mapQuoteSelectedAssembly(row: QuoteSelectedAssemblyRow): QuoteSelectedAssembly {
  return QuoteSelectedAssembly.parse({
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    productAssemblyId: row.productAssemblyId,
    quoteId: row.quoteId,
    quotedName: row.quotedName,
    quotedPrice: row.quotedPrice,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function getSelectedAssembliesByQuoteId({
  db,
  quoteIds,
}: {
  db: Db | DatabaseTransaction;
  quoteIds: readonly UUID[];
}): Promise<Map<UUID, QuoteSelectedAssemblyRow[]>> {
  if (quoteIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select()
    .from(quoteSelectedAssemblies)
    .where(inArray(quoteSelectedAssemblies.quoteId, quoteIds))
    .orderBy(asc(quoteSelectedAssemblies.createdAt), asc(quoteSelectedAssemblies.id));
  const byQuoteId = new Map<UUID, QuoteSelectedAssemblyRow[]>();

  for (const row of rows) {
    const group = byQuoteId.get(row.quoteId) ?? [];
    group.push(row);
    byQuoteId.set(row.quoteId, group);
  }

  return byQuoteId;
}

export async function listQuoteSelectedAssemblies({
  quoteId,
  tx,
}: {
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<QuoteSelectedAssemblyRow[]> {
  return tx
    .select()
    .from(quoteSelectedAssemblies)
    .where(eq(quoteSelectedAssemblies.quoteId, quoteId))
    .orderBy(asc(quoteSelectedAssemblies.createdAt), asc(quoteSelectedAssemblies.id));
}

export async function resolveQuoteSelectedAssemblies({
  currentRows = [],
  input,
  productId,
  quoteId,
  tx,
}: {
  currentRows?: QuoteSelectedAssemblyRow[];
  input: Pick<QuoteCreateInput, 'selectedAssemblies'>;
  productId: UUID;
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<ResolvedQuoteSelectedAssemblies> {
  const existingIds = input.selectedAssemblies
    .filter((selection) => selection.type === 'existing')
    .map((selection) => selection.id);
  const catalogIds = input.selectedAssemblies
    .filter((selection) => selection.type === 'catalog')
    .map((selection) => selection.productAssemblyId);
  const keptRows = getKeptSelectedAssemblyRows({ currentRows, existingIds, quoteId });
  const newRows = await buildNewSelectedAssemblyRows({ catalogIds, productId, quoteId, tx });

  assertUniqueCatalogSelections([...keptRows, ...newRows]);

  const keepIds = new Set(keptRows.map((row) => row.id));
  const removeIds = currentRows.map((row) => row.id).filter((id) => !keepIds.has(id));

  return { newRows, removeIds, rows: [...keptRows, ...newRows] };
}

export async function persistQuoteSelectedAssemblies({
  quoteId,
  resolved,
  tx,
}: {
  quoteId: UUID;
  resolved: ResolvedQuoteSelectedAssemblies;
  tx: DatabaseTransaction;
}): Promise<QuoteSelectedAssemblyRow[]> {
  if (resolved.removeIds.length > 0) {
    await tx.delete(quoteSelectedAssemblies).where(inArray(quoteSelectedAssemblies.id, resolved.removeIds));
  }

  if (resolved.newRows.length > 0) {
    await tx.insert(quoteSelectedAssemblies).values(
      resolved.newRows.map((row) => ({
        productAssemblyId: row.productAssemblyId,
        quoteId: row.quoteId,
        quotedName: row.quotedName,
        quotedPrice: row.quotedPrice,
      })),
    );
  }

  return listQuoteSelectedAssemblies({ quoteId, tx });
}

function getKeptSelectedAssemblyRows({
  currentRows,
  existingIds,
  quoteId,
}: {
  currentRows: QuoteSelectedAssemblyRow[];
  existingIds: UUID[];
  quoteId: UUID;
}): QuoteSelectedAssemblyRow[] {
  assertUniqueIds(existingIds, 'Quote selected assembly can only be preserved once.');

  if (existingIds.length === 0) {
    return [];
  }

  const currentById = new Map(currentRows.map((row) => [row.id, row]));

  return existingIds.map((id) => {
    const row = currentById.get(id);

    if (!row || row.quoteId !== quoteId) {
      throw new QuoteInvalidReferenceError('Selected quote assembly was not found on this quote.');
    }

    return row;
  });
}

async function buildNewSelectedAssemblyRows({
  catalogIds,
  productId,
  quoteId,
  tx,
}: {
  catalogIds: UUID[];
  productId: UUID;
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<QuoteSelectedAssemblyRow[]> {
  assertUniqueIds(catalogIds, 'Catalog optional assembly can only be selected once per quote.');

  if (catalogIds.length === 0) {
    return [];
  }

  const rows = await tx.select().from(productAssemblies).where(inArray(productAssemblies.id, catalogIds));
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const now = new Date();

  return catalogIds.map((id) => {
    const row = rowsById.get(id);

    if (!row || row.productId !== productId || row.kind !== 'optional' || row.price === null) {
      throw new QuoteInvalidReferenceError(
        'Selected quote assembly must be an optional assembly on the quote product.',
      );
    }

    return {
      createdAt: now,
      id,
      productAssemblyId: row.id,
      quoteId,
      quotedName: row.name,
      quotedPrice: row.price,
      updatedAt: now,
    };
  });
}

function assertUniqueCatalogSelections(rows: QuoteSelectedAssemblyRow[]): void {
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.productAssemblyId) {
      continue;
    }

    if (seen.has(row.productAssemblyId)) {
      throw new QuoteInvalidReferenceError('Catalog optional assembly can only be selected once per quote.');
    }

    seen.add(row.productAssemblyId);
  }
}

function assertUniqueIds(ids: readonly UUID[], message: string): void {
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      throw new QuoteInvalidReferenceError(message);
    }

    seen.add(id);
  }
}
