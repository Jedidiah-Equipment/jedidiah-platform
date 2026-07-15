import {
  assemblyOverrides,
  assemblyParts,
  type DatabaseTransaction,
  type Db,
  notRemoved,
  type parts,
  productAssemblies,
  products,
} from '@pkg/db';
import type { Assembly, AssemblyInput, AssemblyKind, AssemblyNameListResult, UUID } from '@pkg/schema';
import { asc, eq, inArray, sql } from 'drizzle-orm';

import {
  AssemblyKindChangedError,
  AssemblyOverrideTargetNotFoundError,
  AssemblyOverrideTargetWrongKindError,
  AssemblyOverrideTargetWrongProductError,
  AssemblyWrongProductError,
  DuplicateAssemblyNameError,
  DuplicateAssemblyPartError,
} from './product-errors.js';

type AssemblyRow = typeof productAssemblies.$inferSelect;
type AssemblyDb = DatabaseTransaction | Db;
export type AssemblyListRow = AssemblyRow & {
  assemblyParts: (typeof assemblyParts.$inferSelect & {
    part: Pick<typeof parts.$inferSelect, 'category' | 'code'>;
  })[];
  optionalOverrides: (typeof assemblyOverrides.$inferSelect)[];
};
export type AssemblyExportRow = {
  productModelCode: string;
  productName: string;
  assemblyType: AssemblyKind;
  assemblyName: string;
  assemblyPrice: string | null;
};

export async function syncAssemblies({
  tx,
  productId,
  desired,
}: {
  tx: DatabaseTransaction;
  productId: UUID;
  desired: AssemblyInput[];
}): Promise<Assembly[]> {
  assertUniqueAssemblyNames(desired);
  assertUniqueAssemblyParts(desired);
  await assertValidOverrideTargets({ tx, productId, desired });

  const currentRows = await tx.select().from(productAssemblies).where(eq(productAssemblies.productId, productId));
  await assertAssemblyIdsBelongToProduct({ tx, productId, desired });
  assertAssemblyKindsUnchanged({ currentRows, desired });
  const desiredIds = new Set(desired.map((assembly) => assembly.id).filter((id): id is string => Boolean(id)));
  const removedIds = currentRows.map((row) => row.id).filter((id) => !desiredIds.has(id));

  if (removedIds.length > 0) {
    await tx.delete(productAssemblies).where(inArray(productAssemblies.id, removedIds));
  }

  const displayOrderByKind: Record<AssemblyInput['kind'], number> = { optional: 0, standard: 0 };

  for (const assembly of desired) {
    const rowValues = {
      displayOrder: displayOrderByKind[assembly.kind]++,
      kind: assembly.kind,
      name: assembly.name,
      price: assembly.kind === 'optional' ? assembly.price : null,
      productId,
      updatedAt: new Date(),
    };

    const [row] = assembly.id
      ? await tx
          .insert(productAssemblies)
          .values({ ...rowValues, id: assembly.id })
          .onConflictDoUpdate({
            target: productAssemblies.id,
            set: rowValues,
          })
          .returning()
      : await tx.insert(productAssemblies).values(rowValues).returning();

    if (!row) {
      throw new Error('Assembly upsert did not return a row');
    }

    await tx.delete(assemblyParts).where(eq(assemblyParts.assemblyId, row.id));
    await tx.delete(assemblyOverrides).where(eq(assemblyOverrides.optionalAssemblyId, row.id));

    if (assembly.parts.length > 0) {
      await tx.insert(assemblyParts).values(
        assembly.parts.map((part) => ({
          assemblyId: row.id,
          partId: part.partId,
          quantity: part.quantity,
        })),
      );
    }

    if (assembly.kind === 'optional' && assembly.overrideStandardAssemblyIds.length > 0) {
      await tx.insert(assemblyOverrides).values(
        assembly.overrideStandardAssemblyIds.map((standardAssemblyId) => ({
          optionalAssemblyId: row.id,
          productId,
          standardAssemblyId,
        })),
      );
    }
  }

  return listAssemblies({ tx, productId });
}

/**
 * Distinct assembly names across every product, for both standard and optional kinds, ordered
 * alphabetically. Like the part-categories distinct-values read (`listPartCategories`), but
 * de-dupes case-insensitively at the source (one entry per name regardless of casing) so the
 * returned set is a clean naming pool for any consumer.
 */
export async function listAssemblyNames({ db }: { db: Db }): Promise<AssemblyNameListResult> {
  const lowerName = sql`lower(${productAssemblies.name})`;
  const rows = await db
    .selectDistinctOn([lowerName], { name: productAssemblies.name })
    .from(productAssemblies)
    .innerJoin(products, eq(productAssemblies.productId, products.id))
    .where(notRemoved(products))
    .orderBy(lowerName, asc(productAssemblies.name));

  return {
    names: rows.map((row) => row.name),
  };
}

export async function exportProductAssemblies({ db }: { db: Db }): Promise<AssemblyExportRow[]> {
  return db
    .select({
      assemblyName: productAssemblies.name,
      assemblyPrice: sql<string | null>`${productAssemblies.price}::text`,
      assemblyType: productAssemblies.kind,
      productModelCode: products.modelCode,
      productName: products.name,
    })
    .from(productAssemblies)
    .innerJoin(products, eq(productAssemblies.productId, products.id))
    .where(notRemoved(products))
    .orderBy(asc(products.modelCode), ...productAssemblyOrderBy);
}

export const productAssemblyOrderBy = [
  sql`case when ${productAssemblies.kind} = 'standard' then 0 else 1 end`,
  asc(productAssemblies.displayOrder),
];

export async function listAssemblies({ tx, productId }: { tx: AssemblyDb; productId: UUID }): Promise<Assembly[]> {
  const rows = await tx.query.productAssemblies.findMany({
    where: eq(productAssemblies.productId, productId),
    orderBy: productAssemblyOrderBy,
    with: {
      assemblyParts: {
        with: {
          part: {
            columns: {
              category: true,
              code: true,
            },
          },
        },
      },
      optionalOverrides: true,
    },
  });

  return rows.map(mapAssembly);
}

export function mapAssembly(row: AssemblyListRow): Assembly {
  const assemblyPartsForRow = row.assemblyParts
    .map((part) => ({
      category: part.part.category,
      code: part.part.code,
      partId: part.partId,
      quantity: part.quantity,
    }))
    .toSorted((left, right) => left.category.localeCompare(right.category) || left.code.localeCompare(right.code))
    .map((part) => ({
      partId: part.partId,
      quantity: part.quantity,
    }));

  if (row.kind === 'standard') {
    return {
      id: row.id,
      kind: 'standard',
      name: row.name,
      parts: assemblyPartsForRow,
      productId: row.productId,
      translations: row.translations,
    };
  }

  return {
    id: row.id,
    kind: 'optional',
    name: row.name,
    overrideStandardAssemblyIds: row.optionalOverrides.map((override) => override.standardAssemblyId),
    parts: assemblyPartsForRow,
    price: row.price ?? 0,
    productId: row.productId,
    translations: row.translations,
  };
}

async function assertAssemblyIdsBelongToProduct({
  tx,
  productId,
  desired,
}: {
  tx: DatabaseTransaction;
  productId: UUID;
  desired: AssemblyInput[];
}): Promise<void> {
  const desiredIds = desired.map((assembly) => assembly.id).filter((id): id is string => Boolean(id));

  if (desiredIds.length === 0) {
    return;
  }

  const persistedRows = await tx.select().from(productAssemblies).where(inArray(productAssemblies.id, desiredIds));

  for (const row of persistedRows) {
    if (row.productId !== productId) {
      throw new AssemblyWrongProductError(row.id, productId);
    }
  }
}

/**
 * Assembly kind is immutable after creation. Persisted Quote selections rely on this: a selection's
 * `productAssemblyId` either resolves to a live Optional Assembly or was nulled by deletion, so a
 * null reference is the complete stale set for Quote Pricing.
 */
function assertAssemblyKindsUnchanged({
  currentRows,
  desired,
}: {
  currentRows: AssemblyRow[];
  desired: AssemblyInput[];
}): void {
  const currentKindById = new Map(currentRows.map((row) => [row.id, row.kind]));

  for (const assembly of desired) {
    if (!assembly.id) {
      continue;
    }

    const currentKind = currentKindById.get(assembly.id);

    if (currentKind !== undefined && currentKind !== assembly.kind) {
      throw new AssemblyKindChangedError(assembly.id);
    }
  }
}

function assertUniqueAssemblyNames(assemblies: AssemblyInput[]): void {
  const names = new Set<string>();

  for (const assembly of assemblies) {
    const name = assembly.name.trim().toLowerCase();

    if (names.has(name)) {
      throw new DuplicateAssemblyNameError(assembly.name);
    }

    names.add(name);
  }
}

function assertUniqueAssemblyParts(assemblies: AssemblyInput[]): void {
  for (const assembly of assemblies) {
    const partIds = new Set<string>();

    for (const part of assembly.parts) {
      if (partIds.has(part.partId)) {
        throw new DuplicateAssemblyPartError(part.partId);
      }

      partIds.add(part.partId);
    }
  }
}

async function assertValidOverrideTargets({
  tx,
  productId,
  desired,
}: {
  tx: DatabaseTransaction;
  productId: UUID;
  desired: AssemblyInput[];
}): Promise<void> {
  const desiredById = new Map(desired.flatMap((assembly) => (assembly.id ? [[assembly.id, assembly]] : [])));
  const overrideTargetIds = desired.flatMap((assembly) =>
    assembly.kind === 'optional' ? assembly.overrideStandardAssemblyIds : [],
  );

  if (overrideTargetIds.length === 0) {
    return;
  }

  const persistedTargets = await tx
    .select()
    .from(productAssemblies)
    .where(inArray(productAssemblies.id, overrideTargetIds));
  const persistedById = new Map(persistedTargets.map((target) => [target.id, target]));

  for (const targetId of overrideTargetIds) {
    const desiredTarget = desiredById.get(targetId);

    if (desiredTarget) {
      if (desiredTarget.kind !== 'standard') {
        throw new AssemblyOverrideTargetWrongKindError(targetId);
      }

      continue;
    }

    const persistedTarget = persistedById.get(targetId);

    if (!persistedTarget) {
      throw new AssemblyOverrideTargetNotFoundError(targetId);
    }

    if (persistedTarget.productId !== productId) {
      throw new AssemblyOverrideTargetWrongProductError(targetId, productId);
    }

    if (persistedTarget.kind !== 'standard') {
      throw new AssemblyOverrideTargetWrongKindError(targetId);
    }
  }
}
