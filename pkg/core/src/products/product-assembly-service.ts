import { assemblyOverrides, assemblyParts, type DatabaseTransaction, type Db, parts, productAssemblies } from '@pkg/db';
import type { Assembly, AssemblyInput, UUID } from '@pkg/schema';
import { asc, eq, inArray, sql } from 'drizzle-orm';

import {
  AssemblyOverrideTargetNotFoundError,
  AssemblyOverrideTargetWrongKindError,
  AssemblyOverrideTargetWrongProductError,
  AssemblyWrongProductError,
  DuplicateAssemblyNameError,
  DuplicateAssemblyPartError,
} from './product-errors.js';

type AssemblyRow = typeof productAssemblies.$inferSelect;
type AssemblyDb = DatabaseTransaction | Db;
type AssemblyPartRow = typeof assemblyParts.$inferSelect & {
  partCategory: string;
  partCode: string;
};
type OverrideRow = typeof assemblyOverrides.$inferSelect;

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
  const desiredIds = new Set(desired.map((assembly) => assembly.id).filter((id): id is string => Boolean(id)));
  const removedIds = currentRows.map((row) => row.id).filter((id) => !desiredIds.has(id));

  if (removedIds.length > 0) {
    await tx.delete(productAssemblies).where(inArray(productAssemblies.id, removedIds));
  }

  for (const assembly of desired) {
    const rowValues = {
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

export async function listAssemblies({ tx, productId }: { tx: AssemblyDb; productId: UUID }): Promise<Assembly[]> {
  const rows = await tx
    .select()
    .from(productAssemblies)
    .where(eq(productAssemblies.productId, productId))
    .orderBy(sql`case when ${productAssemblies.kind} = 'standard' then 0 else 1 end`, asc(productAssemblies.name));

  return hydrateAssemblies({ tx, rows });
}

async function hydrateAssemblies({ tx, rows }: { tx: AssemblyDb; rows: AssemblyRow[] }): Promise<Assembly[]> {
  if (rows.length === 0) {
    return [];
  }

  const assemblyIds = rows.map((row) => row.id);
  const [partRows, overrideRows] = await Promise.all([
    tx
      .select({
        assemblyId: assemblyParts.assemblyId,
        partCategory: parts.category,
        partCode: parts.code,
        partId: assemblyParts.partId,
        quantity: assemblyParts.quantity,
      })
      .from(assemblyParts)
      .innerJoin(parts, eq(parts.id, assemblyParts.partId))
      .where(inArray(assemblyParts.assemblyId, assemblyIds))
      .orderBy(asc(parts.category), asc(parts.code)),
    tx.select().from(assemblyOverrides).where(inArray(assemblyOverrides.optionalAssemblyId, assemblyIds)),
  ]);

  return rows.map((row) => mapAssembly(row, partRows, overrideRows));
}

function mapAssembly(row: AssemblyRow, partRows: AssemblyPartRow[], overrideRows: OverrideRow[]): Assembly {
  const assemblyPartsForRow = partRows
    .filter((part) => part.assemblyId === row.id)
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
    };
  }

  return {
    id: row.id,
    kind: 'optional',
    name: row.name,
    overrideStandardAssemblyIds: overrideRows
      .filter((override) => override.optionalAssemblyId === row.id)
      .map((override) => override.standardAssemblyId),
    parts: assemblyPartsForRow,
    price: row.price ?? 0,
    productId: row.productId,
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
