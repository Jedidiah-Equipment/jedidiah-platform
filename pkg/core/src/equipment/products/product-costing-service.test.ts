import { auditEvents, user } from '@pkg/db';
import { laborDepartmentRates, parts, supplier } from '@pkg/db/equipment';
import type { ProductCreateInput, ProductUpdateInput } from '@pkg/schema/equipment';
import { and, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { postAdjustment } from '../inventory/stock-movement-service.js';
import { getLaborRateCard, updateLaborRateCard } from '../labor-rates/labor-rate-service.js';
import { partValues } from '../test/part-fixtures.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { getProductCostEstimate } from './product-cost-estimate-service.js';
import { ProductMaterialPartInvalidError } from './product-errors.js';
import { createProduct, getProduct, updateProduct } from './product-service.js';

const actorUserId = 'product-costing-test-user';

const test = createTester(async ({ db }) => {
  await db
    .update(laborDepartmentRates)
    .set({ costToCompanyRate: 225 })
    .where(eq(laborDepartmentRates.id, 'fabrication'));
  await db.update(laborDepartmentRates).set({ costToCompanyRate: 70 }).where(eq(laborDepartmentRates.id, 'paint'));
  const now = new Date('2026-08-10T06:00:00.000Z');
  await db.insert(user).values({
    createdAt: now,
    email: 'product-costing@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Product Costing Tester',
    role: 'admin',
    updatedAt: now,
  });
  const rangeId = await createProductRangeFixture(db);
  const [createdSupplier] = await db.insert(supplier).values({ companyName: 'Material Supplier' }).returning();
  if (!createdSupplier) throw new Error('Supplier insert did not return a row');
  const [plate, channel, bought, fabricated, uncosted] = await db
    .insert(parts)
    .values([
      partValues({
        code: 'PLATE',
        stockTrackingMode: 'periodic',
        supplierId: createdSupplier.id,
        unitOfMeasure: 'piece',
      }),
      partValues({
        code: 'CHANNEL',
        standardPurchaseLengthMm: 13_000,
        stockTrackingMode: 'periodic',
        supplierId: createdSupplier.id,
        unitOfMeasure: 'mm',
      }),
      partValues({ code: 'BOUGHT', supplierId: createdSupplier.id, unitOfMeasure: 'piece' }),
      partValues({
        code: 'FABRICATED',
        isInternallyFabricated: true,
        supplierId: createdSupplier.id,
        unitOfMeasure: 'piece',
      }),
      partValues({ code: 'UNCOSTED', supplierId: createdSupplier.id, unitOfMeasure: 'piece' }),
    ])
    .returning();
  if (!plate || !channel || !bought || !fabricated || !uncosted) throw new Error('Part inserts did not return rows');

  return { bought, channel, fabricated, plate, rangeId, uncosted };
});

function productInput(rangeId: string, overrides: Partial<ProductCreateInput> = {}): ProductCreateInput {
  return {
    assemblies: [],
    basePrice: 100_000,
    brochureEnabled: false,
    buildTimeDays: 14,
    category: null,
    currencyCode: 'ZAR',
    description: null,
    displayOrder: 0,
    keyFeatures: [],
    laborHours: [],
    landerEnabled: false,
    materialLines: [],
    modelCode: 'COST-1',
    name: 'Costed Product',
    nameHighlight: null,
    productBays: [],
    rangeId,
    requiresVinNumber: false,
    thumbnailDataUrl: null,
    variantId: null,
    ...overrides,
  };
}

function updateInput(product: Awaited<ReturnType<typeof createProduct>>): ProductUpdateInput {
  return {
    basePrice: product.basePrice,
    brochureEnabled: product.brochureEnabled,
    buildTimeDays: product.buildTimeDays,
    currencyCode: product.currencyCode,
    description: product.description,
    id: product.id,
    landerEnabled: product.landerEnabled,
    modelCode: product.modelCode,
    name: product.name,
    rangeId: product.rangeId,
    requiresVinNumber: product.requiresVinNumber,
    thumbnailDataUrl: product.thumbnailDataUrl,
  };
}

describe('Product costing child collections', () => {
  test('rejects a perpetual Part in the Product Material List', async ({ context }) => {
    await expect(
      createProduct({
        actorUserId,
        db: context.db,
        input: productInput(context.rangeId, {
          materialLines: [{ partId: context.bought.id, quantityPerUnit: 1 }],
        }),
      }),
    ).rejects.toBeInstanceOf(ProductMaterialPartInvalidError);
  });

  test('creates, replaces, preserves, and reads per-unit materials and labor hours', async ({ context }) => {
    const created = await createProduct({
      actorUserId,
      db: context.db,
      input: productInput(context.rangeId, {
        laborHours: [{ department: 'fabrication', daysPerStaff: 5, staffCount: 2 }],
        materialLines: [{ partId: context.plate.id, quantityPerUnit: 2.5 }],
      }),
    });

    expect(created).toMatchObject({
      laborHours: [{ department: 'fabrication', daysPerStaff: 5, staffCount: 2 }],
      materialLines: [{ partId: context.plate.id, quantityPerUnit: 2.5 }],
    });

    await updateProduct({
      actorUserId,
      db: context.db,
      input: {
        ...updateInput(created),
        laborHours: [{ department: 'paint', daysPerStaff: 1.5, staffCount: 1 }],
        materialLines: [{ partId: context.channel.id, quantityPerUnit: 3 }],
      },
    });
    await updateProduct({ actorUserId, db: context.db, input: updateInput(created) });

    await expect(getProduct({ db: context.db, id: created.id })).resolves.toMatchObject({
      laborHours: [{ department: 'paint', daysPerStaff: 1.5, staffCount: 1 }],
      materialLines: [{ partId: context.channel.id, quantityPerUnit: 3 }],
    });
    await expect(
      context.db
        .select({ changes: auditEvents.changes })
        .from(auditEvents)
        .where(and(eq(auditEvents.entityType, 'product'), eq(auditEvents.entityId, created.id))),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changes: expect.objectContaining({
            'laborHour:fabrication': expect.any(Object),
            'laborHour:paint': expect.any(Object),
            'materialLine:CHANNEL': expect.any(Object),
            'materialLine:PLATE': expect.any(Object),
          }),
        }),
      ]),
    );
  });
});

describe('getProductCostEstimate', () => {
  test('prices materials, the effective BOM, labor with overheads, margin, and Optional Assembly partials', async ({
    context,
  }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: {
        delta: 10,
        lengthMm: null,
        note: null,
        partId: context.plate.id,
        reason: 'opening-balance',
        unitCost: 200,
      },
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: {
        delta: 10,
        lengthMm: 13_000,
        note: null,
        partId: context.channel.id,
        reason: 'opening-balance',
        unitCost: 1_300,
      },
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: {
        delta: 10,
        lengthMm: null,
        note: null,
        partId: context.bought.id,
        reason: 'opening-balance',
        unitCost: 100,
      },
    });
    const product = await createProduct({
      actorUserId,
      db: context.db,
      input: productInput(context.rangeId, {
        assemblies: [
          {
            isPubliclyVisible: false,
            kind: 'standard',
            name: 'Base',
            parts: [
              { partId: context.bought.id, quantity: 2 },
              { partId: context.fabricated.id, quantity: 4 },
            ],
          },
          {
            isPubliclyVisible: false,
            kind: 'standard',
            name: 'Replaceable',
            parts: [{ partId: context.bought.id, quantity: 1 }],
          },
          {
            isPubliclyVisible: false,
            kind: 'optional',
            name: 'Premium',
            overrideStandardAssemblyIds: [],
            parts: [{ partId: context.bought.id, quantity: 3 }],
            price: 1_000,
          },
        ],
        laborHours: [
          { department: 'fabrication', daysPerStaff: 5, staffCount: 1 },
          { department: 'paint', daysPerStaff: 2, staffCount: 1 },
        ],
        materialLines: [
          { partId: context.plate.id, quantityPerUnit: 2.5 },
          { partId: context.channel.id, quantityPerUnit: 3 },
        ],
      }),
    });
    const replaceable = product.assemblies.find((assembly) => assembly.name === 'Replaceable');
    const premium = product.assemblies.find((assembly) => assembly.name === 'Premium');
    if (!replaceable || premium?.kind !== 'optional') throw new Error('Expected costing assemblies');
    await updateProduct({
      actorUserId,
      db: context.db,
      input: {
        ...updateInput(product),
        assemblies: product.assemblies.map((assembly) =>
          assembly.id === premium.id ? { ...assembly, overrideStandardAssemblyIds: [replaceable.id] } : assembly,
        ),
      },
    });

    const base = await getProductCostEstimate({ db: context.db, productId: product.id });
    const selected = await getProductCostEstimate({
      db: context.db,
      productId: product.id,
      selectedAssemblyIds: [premium.id],
    });

    expect(base).toMatchObject({
      complete: true,
      consumablesCostFloor: 6_579,
      estimatedMarginCeiling: 71_643.5,
      laborCostFloor: 11_385,
      managementOverheadCostFloor: 5_692.5,
      managementOverheadPercentage: 50,
      materialCostFloor: 4_400,
      missing: {
        laborHours: false,
        materialList: false,
        unattributedProductTerms: false,
        uncostedParts: [],
        unratedDepartments: [],
      },
      partsCostFloor: 300,
      totalCostFloor: 28_356.5,
    });
    expect(base.laborHours).toEqual([
      {
        consumablesCost: 6_075,
        consumablesPercentage: 60,
        daysPerStaff: 5,
        department: 'fabrication',
        departmentTotal: 16_200,
        hourlyRate: 225,
        hours: 45,
        laborCost: 10_125,
        staffCount: 1,
      },
      expect.objectContaining({ consumablesCost: 504, department: 'paint', hours: 18, laborCost: 1_260 }),
    ]);
    expect(
      base.materialLines.map((line) => [line.partCode, line.unitCost, line.costFloor, line.standardPurchaseLengthMm]),
    ).toEqual([
      ['CHANNEL', 1_300, 3_900, 13_000],
      ['PLATE', 200, 500, null],
    ]);
    expect(base.optionalAssemblies).toEqual([
      expect.objectContaining({ assemblyName: 'Premium', costFloor: 300, partial: true, upgradePrice: 1_000 }),
    ]);
    expect(selected.assemblies.map((assembly) => assembly.assemblyName)).toEqual(['Base', 'Premium']);
    expect(selected.partsCostFloor).toBe(500);
  });

  test('prices an Assembly line of linear stock by the whole piece, and says which piece', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: {
        delta: 10,
        lengthMm: 13_000,
        note: null,
        partId: context.channel.id,
        reason: 'opening-balance',
        unitCost: 1_300,
      },
    });
    const product = await createProduct({
      actorUserId,
      db: context.db,
      input: productInput(context.rangeId, {
        assemblies: [
          {
            isPubliclyVisible: false,
            kind: 'standard',
            name: 'Harness',
            parts: [{ partId: context.channel.id, quantity: 8 }],
          },
        ],
        modelCode: 'COST-3',
        name: 'Linear Assembly Product',
      }),
    });

    const estimate = await getProductCostEstimate({ db: context.db, productId: product.id });

    // The average is R0.10/mm; the line is 8 whole 13 m pieces, so the unit cost is a piece's worth.
    expect(estimate.assemblies.flatMap((assembly) => assembly.parts)).toEqual([
      expect.objectContaining({
        costFloor: 10_400,
        partCode: 'CHANNEL',
        quantity: 8,
        standardPurchaseLengthMm: 13_000,
        unitCost: 1_300,
        unitOfMeasure: 'mm',
      }),
    ]);
  });

  test('shows a floor and ignores null cost only for internally fabricated Parts', async ({ context }) => {
    const product = await createProduct({
      actorUserId,
      db: context.db,
      input: productInput(context.rangeId, {
        assemblies: [
          {
            isPubliclyVisible: false,
            kind: 'standard',
            name: 'Base',
            parts: [
              { partId: context.uncosted.id, quantity: 2 },
              { partId: context.fabricated.id, quantity: 3 },
            ],
          },
        ],
        modelCode: 'COST-2',
        name: 'Incomplete Product',
      }),
    });

    await expect(getProductCostEstimate({ db: context.db, productId: product.id })).resolves.toMatchObject({
      complete: false,
      missing: {
        laborHours: true,
        materialList: true,
        uncostedParts: [{ partCode: 'UNCOSTED', partId: context.uncosted.id }],
      },
      partsCostFloor: 0,
      totalCostFloor: 0,
    });
  });

  test('flags labor in an unrated Department as missing rather than pricing it at zero with confidence', async ({
    context,
  }) => {
    const product = await createProduct({
      actorUserId,
      db: context.db,
      input: productInput(context.rangeId, {
        laborHours: [
          { department: 'fabrication', daysPerStaff: 1, staffCount: 2 },
          { department: 'workshop', daysPerStaff: 1, staffCount: 1 },
        ],
        materialLines: [{ partId: context.plate.id, quantityPerUnit: 1 }],
        modelCode: 'COST-3',
        name: 'Unrated Product',
      }),
    });

    const estimate = await getProductCostEstimate({ db: context.db, productId: product.id });

    expect(estimate).toMatchObject({
      complete: false,
      laborCostFloor: 4_050,
      missing: { laborHours: false, unratedDepartments: ['workshop'] },
    });
    expect(estimate.laborHours.find((line) => line.department === 'workshop')).toMatchObject({
      consumablesCost: 0,
      consumablesPercentage: 0,
      departmentTotal: 0,
      hourlyRate: 0,
      hours: 9,
      laborCost: 0,
    });
    const card = await getLaborRateCard({ db: context.db });
    for (const costToCompanyRate of [0, 100]) {
      await updateLaborRateCard({
        db: context.db,
        actorUserId,
        input: {
          ...card,
          rates: card.rates.map((rate) => (rate.department === 'workshop' ? { ...rate, costToCompanyRate } : rate)),
        },
      });
      const repriced = await getProductCostEstimate({ db: context.db, productId: product.id });
      expect(repriced.missing.unratedDepartments).toEqual(costToCompanyRate === 0 ? ['workshop'] : []);
      expect(repriced.laborCostFloor).toBe(costToCompanyRate === 0 ? 4_050 : 4_950);
    }
  });
});
