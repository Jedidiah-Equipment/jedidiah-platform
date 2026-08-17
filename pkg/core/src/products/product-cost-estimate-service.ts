import { type DatabaseTransaction, type Db, notRemoved, parts, products } from '@pkg/db';
import { buildCfo, buildReworkCfo, WORK_ITEM_DEPARTMENT_RATES } from '@pkg/domain';
import type {
  Assembly,
  PartUnitOfMeasure,
  ProductCostEstimate,
  ProductCostEstimateAssembly,
  ProductCostEstimateMissingPart,
  ProductCostEstimatePartLine,
  UUID,
} from '@pkg/schema';
import { ProductCostEstimate as ProductCostEstimateSchema } from '@pkg/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { loadMovingAverages, scaleUnitCost } from '../inventory/ledger.js';
import { sumBy } from '../inventory/row-grouping.js';
import { listAssemblies } from './product-assembly-service.js';
import { listProductCostingInputs } from './product-costing-input-service.js';
import { ProductNotFoundError } from './product-errors.js';

type CostedPartFacts = {
  averageUnitCost: number | null;
  code: string;
  id: UUID;
  isInternallyFabricated: boolean;
  name: string;
  standardPurchaseLengthMm: number | null;
  unitOfMeasure: PartUnitOfMeasure;
};

export async function getProductCostEstimate({
  db,
  includeRemovedProduct = false,
  lockProductRevision = false,
  productId,
  scope = 'build',
  selectedAssemblyIds = [],
}: {
  db: Db | DatabaseTransaction;
  includeRemovedProduct?: boolean;
  lockProductRevision?: boolean;
  productId: UUID;
  scope?: 'build' | 'rework';
  selectedAssemblyIds?: readonly UUID[];
}): Promise<ProductCostEstimate> {
  // The Job snapshot path locks the Product first, before any child query starts. Product updates
  // update that same row before replacing children, so the lock freezes one whole Product revision.
  const product = await loadProductHeader(db, productId, includeRemovedProduct, lockProductRevision);
  const [catalogAssemblies, costingInputs] = await Promise.all([
    listAssemblies({ tx: db, productId }),
    listProductCostingInputs({ db, productId }),
  ]);
  const buildSpec = selectedAssemblyIds.map((productAssemblyId) => ({
    assemblyName: catalogAssemblies.find((assembly) => assembly.id === productAssemblyId)?.name ?? 'Unknown Assembly',
    productAssemblyId,
  }));
  const cfoResult =
    scope === 'rework' ? buildReworkCfo({ buildSpec, catalogAssemblies }) : buildCfo({ buildSpec, catalogAssemblies });
  if (!cfoResult.ok) throw new Error(`Cannot estimate stale Assemblies: ${cfoResult.staleAssemblyNames.join(', ')}`);

  const partIds = [
    ...new Set([
      ...costingInputs.materialLines.map((line) => line.partId),
      ...catalogAssemblies.flatMap((assembly) => assembly.parts.map((part) => part.partId)),
    ]),
  ];
  const [partRows, averages] = await Promise.all([loadPartRows(db, partIds), loadMovingAverages(db, partIds)]);
  const factsById = new Map(
    partRows.map((part): [UUID, CostedPartFacts] => [
      part.id,
      { ...part, averageUnitCost: averages.get(part.id) ?? null },
    ]),
  );
  const materialLines = (scope === 'build' ? costingInputs.materialLines : [])
    .map((line) => {
      const part = requiredPart(factsById, line.partId);
      const unitCost = scaleUnitCost(part.averageUnitCost, part.standardPurchaseLengthMm);

      return {
        costFloor: line.quantityPerUnit * (unitCost ?? 0),
        partCode: part.code,
        partId: part.id,
        partName: part.name,
        quantityPerUnit: line.quantityPerUnit,
        standardPurchaseLengthMm: part.standardPurchaseLengthMm,
        unitCost,
        unitOfMeasure: part.unitOfMeasure,
      };
    })
    .toSorted((left, right) => left.partCode.localeCompare(right.partCode));
  const assemblyByName = new Map(catalogAssemblies.map((assembly) => [assembly.name, assembly]));
  const assemblies = cfoResult.cfo.map((entry) => {
    const assembly = assemblyByName.get(entry.assemblyName);
    if (!assembly) throw new Error(`Effective BOM Assembly not found: ${entry.assemblyName}`);

    return costAssembly(assembly, factsById, false);
  });
  const optionalAssemblies = catalogAssemblies
    .filter((assembly) => assembly.kind === 'optional')
    .map((assembly) => costAssembly(assembly, factsById, true));
  const laborHours = (scope === 'build' ? costingInputs.laborHours : []).map((line) => ({
    cost: line.hours * WORK_ITEM_DEPARTMENT_RATES[line.department],
    department: line.department,
    hourlyRate: WORK_ITEM_DEPARTMENT_RATES[line.department],
    hours: line.hours,
  }));
  const uncostedParts = collectUncostedParts([
    ...materialLines.map((line) => requiredPart(factsById, line.partId)),
    ...assemblies.flatMap((assembly) => assembly.parts.map((line) => requiredPart(factsById, line.partId))),
  ]);
  const materialCostFloor = sumBy(materialLines, (line) => line.costFloor);
  const partsCostFloor = sumBy(assemblies, (assembly) => assembly.costFloor);
  const laborCostFloor = sumBy(laborHours, (line) => line.cost);
  const totalCostFloor = materialCostFloor + partsCostFloor + laborCostFloor;
  const missing = {
    laborHours: scope === 'build' && laborHours.length === 0,
    materialList: scope === 'build' && materialLines.length === 0,
    unattributedProductTerms: scope === 'rework',
    uncostedParts,
  };
  const complete =
    !missing.laborHours &&
    !missing.materialList &&
    !missing.unattributedProductTerms &&
    missing.uncostedParts.length === 0;

  return ProductCostEstimateSchema.parse({
    assemblies,
    basePrice: product.basePrice,
    complete,
    currencyCode: product.currencyCode,
    estimatedMarginCeiling: product.basePrice - totalCostFloor,
    laborCostFloor,
    laborHours,
    materialCostFloor,
    materialLines,
    missing,
    optionalAssemblies,
    partsCostFloor,
    productId,
    scope,
    totalCostFloor,
  });
}

function costAssembly(
  assembly: Assembly,
  factsById: ReadonlyMap<UUID, CostedPartFacts>,
  partial: boolean,
): ProductCostEstimateAssembly {
  const partLines = assembly.parts.map((line): ProductCostEstimatePartLine => {
    const part = requiredPart(factsById, line.partId);
    const unitCost = scaleUnitCost(part.averageUnitCost, part.standardPurchaseLengthMm);

    return {
      costFloor: line.quantity * (unitCost ?? 0),
      isInternallyFabricated: part.isInternallyFabricated,
      partCode: part.code,
      partId: part.id,
      partName: part.name,
      quantity: line.quantity,
      standardPurchaseLengthMm: part.standardPurchaseLengthMm,
      unitCost,
      unitOfMeasure: part.unitOfMeasure,
    };
  });
  const uncostedPartCount = collectUncostedParts(partLines.map((line) => requiredPart(factsById, line.partId))).length;

  return {
    assemblyId: assembly.id,
    assemblyName: assembly.name,
    complete: uncostedPartCount === 0,
    costFloor: sumBy(partLines, (line) => line.costFloor),
    kind: assembly.kind,
    partial,
    parts: partLines,
    uncostedPartCount,
    upgradePrice: assembly.kind === 'optional' ? assembly.price : null,
  };
}

function collectUncostedParts(partsToCheck: readonly CostedPartFacts[]): ProductCostEstimateMissingPart[] {
  return [
    ...new Map(
      partsToCheck
        .filter((part) => !part.isInternallyFabricated && part.averageUnitCost === null)
        .map((part) => [
          part.id,
          { partCode: part.code, partId: part.id, partName: part.name } satisfies ProductCostEstimateMissingPart,
        ]),
    ).values(),
  ].toSorted((left, right) => left.partCode.localeCompare(right.partCode));
}

async function loadProductHeader(
  db: Db | DatabaseTransaction,
  productId: UUID,
  includeRemovedProduct: boolean,
  lockProductRevision: boolean,
) {
  const query = db
    .select({ basePrice: products.basePrice, currencyCode: products.currencyCode })
    .from(products)
    .where(includeRemovedProduct ? eq(products.id, productId) : and(eq(products.id, productId), notRemoved(products)));
  const [product] = await (lockProductRevision ? query.for('share').limit(1) : query.limit(1));
  if (!product) throw new ProductNotFoundError(productId);

  return { ...product, currencyCode: 'ZAR' as const };
}

async function loadPartRows(db: Db | DatabaseTransaction, partIds: readonly UUID[]) {
  if (partIds.length === 0) return [];

  return db
    .select({
      code: parts.code,
      id: parts.id,
      isInternallyFabricated: parts.isInternallyFabricated,
      name: parts.name,
      standardPurchaseLengthMm: parts.standardPurchaseLengthMm,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .where(inArray(parts.id, [...partIds]))
    .orderBy(asc(parts.code), asc(parts.id));
}

function requiredPart(factsById: ReadonlyMap<UUID, CostedPartFacts>, partId: UUID): CostedPartFacts {
  const part = factsById.get(partId);
  if (!part) throw new Error(`Product costing Part not found: ${partId}`);

  return part;
}
