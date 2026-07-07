import { type Db, productAssemblies, user } from '@pkg/db';
import type { AssemblyInput, ProductCreateInput } from '@pkg/schema';
import { asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { exportProductAssemblies, listAssemblyNames } from './product-assembly-service.js';
import { createProduct, getProduct, removeProduct, updateProduct } from './product-service.js';

const actorUserId = 'test-user-id';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const rangeId = await createProductRangeFixture(db);

  return { db, rangeId };
});

function standard(name: string): AssemblyInput {
  return { kind: 'standard', name, parts: [] };
}

function optional(name: string, price = 100): AssemblyInput {
  return { kind: 'optional', name, overrideStandardAssemblyIds: [], parts: [], price };
}

function productInput(
  rangeId: string,
  assemblies: AssemblyInput[],
  overrides: Partial<ProductCreateInput> = {},
): ProductCreateInput {
  return {
    assemblies,
    basePrice: 1000,
    category: null,
    keyFeatures: [],
    technicalDetails: [],
    buildTimeDays: 14,
    currencyCode: 'ZAR',
    description: null,
    modelCode: 'MODEL-1',
    name: 'Test Product',
    nameHighlight: null,
    productBays: [],
    rangeId,
    variantId: null,
    requiresVinNumber: false,
    brochureEnabled: false,
    landerEnabled: false,
    thumbnailDataUrl: null,
    ...overrides,
  };
}

async function selectDisplayOrders(db: Db, productId: string) {
  const rows = await db
    .select({
      displayOrder: productAssemblies.displayOrder,
      kind: productAssemblies.kind,
      name: productAssemblies.name,
    })
    .from(productAssemblies)
    .where(eq(productAssemblies.productId, productId))
    .orderBy(asc(productAssemblies.displayOrder));

  return rows;
}

describe('assembly display order', () => {
  test('assigns display_order densely per kind from array position, ignoring name', async ({ context }) => {
    // Names deliberately out of alphabetical order to prove order follows array position.
    const product = await createProduct({
      actorUserId,
      db: context.db,
      input: productInput(context.rangeId, [standard('Zebra'), standard('Alpha'), optional('Yak'), optional('Beta')]),
    });

    const rows = await selectDisplayOrders(context.db, product.id);

    expect(rows).toEqual(
      expect.arrayContaining([
        { displayOrder: 0, kind: 'standard', name: 'Zebra' },
        { displayOrder: 1, kind: 'standard', name: 'Alpha' },
        { displayOrder: 0, kind: 'optional', name: 'Yak' },
        { displayOrder: 1, kind: 'optional', name: 'Beta' },
      ]),
    );
  });

  test('reads assemblies in persisted order: standards first by display_order, not alphabetical', async ({
    context,
  }) => {
    const created = await createProduct({
      actorUserId,
      db: context.db,
      input: productInput(context.rangeId, [standard('Zebra'), standard('Alpha'), optional('Yak'), optional('Beta')]),
    });

    const product = await getProduct({ db: context.db, id: created.id });

    expect(product.assemblies.map((assembly) => assembly.name)).toEqual(['Zebra', 'Alpha', 'Yak', 'Beta']);
  });

  test('persists a reorder through update and survives a re-read', async ({ context }) => {
    const created = await createProduct({
      actorUserId,
      db: context.db,
      input: productInput(context.rangeId, [standard('Zebra'), standard('Alpha'), optional('Yak'), optional('Beta')]),
    });

    const standards = created.assemblies.filter((assembly) => assembly.kind === 'standard');
    const optionals = created.assemblies.filter((assembly) => assembly.kind === 'optional');

    // Swap each kind group's order, sending the desired array in the new order.
    await updateProduct({
      actorUserId,
      db: context.db,
      input: {
        basePrice: 1000,
        buildTimeDays: 14,
        currencyCode: 'ZAR',
        description: null,
        id: created.id,
        modelCode: 'MODEL-1',
        name: 'Test Product',
        productBays: [],
        rangeId: context.rangeId,
        requiresVinNumber: false,
        brochureEnabled: false,
        landerEnabled: false,
        thumbnailDataUrl: null,
        assemblies: [
          { id: standards[1]?.id, kind: 'standard', name: 'Alpha', parts: [] },
          { id: standards[0]?.id, kind: 'standard', name: 'Zebra', parts: [] },
          {
            id: optionals[1]?.id,
            kind: 'optional',
            name: 'Beta',
            overrideStandardAssemblyIds: [],
            parts: [],
            price: 100,
          },
          {
            id: optionals[0]?.id,
            kind: 'optional',
            name: 'Yak',
            overrideStandardAssemblyIds: [],
            parts: [],
            price: 100,
          },
        ],
      },
    });

    const reread = await getProduct({ db: context.db, id: created.id });

    expect(reread.assemblies.map((assembly) => assembly.name)).toEqual(['Alpha', 'Zebra', 'Beta', 'Yak']);

    const rows = await selectDisplayOrders(context.db, created.id);
    expect(rows).toEqual(
      expect.arrayContaining([
        { displayOrder: 0, kind: 'standard', name: 'Alpha' },
        { displayOrder: 1, kind: 'standard', name: 'Zebra' },
        { displayOrder: 0, kind: 'optional', name: 'Beta' },
        { displayOrder: 1, kind: 'optional', name: 'Yak' },
      ]),
    );
  });
});

describe('listAssemblyNames', () => {
  test('returns distinct names across products and kinds, case-insensitively de-duped and alphabetical', async ({
    context,
  }) => {
    await createProduct({
      actorUserId,
      db: context.db,
      input: productInput(context.rangeId, [standard('Hydraulics'), optional('Canopy')], {
        modelCode: 'MODEL-A',
        name: 'Product A',
      }),
    });
    await createProduct({
      actorUserId,
      db: context.db,
      // `hydraulics` collides case-insensitively with Product A's `Hydraulics`; `Bucket` is new.
      input: productInput(context.rangeId, [standard('hydraulics'), standard('Bucket')], {
        modelCode: 'MODEL-B',
        name: 'Product B',
      }),
    });

    const result = await listAssemblyNames({ db: context.db });

    // Four assemblies collapse to three distinct names; which casing of "hydraulics" wins is left to
    // the DB, so compare case-insensitively while still asserting the alphabetical order.
    expect(result.names).toHaveLength(3);
    expect(result.names.map((name) => name.toLowerCase())).toEqual(['bucket', 'canopy', 'hydraulics']);
  });

  test('returns an empty list when no assemblies exist', async ({ context }) => {
    const result = await listAssemblyNames({ db: context.db });

    expect(result.names).toEqual([]);
  });
});

describe('exportProductAssemblies', () => {
  test('returns the full active catalog as one ordered row per assembly', async ({ context }) => {
    await createProduct({
      actorUserId,
      db: context.db,
      input: productInput(context.rangeId, [optional('Extended Hopper', 12_500), standard('Main Frame')], {
        modelCode: 'AL6',
        name: 'Auger Loader 6',
      }),
    });
    await createProduct({
      actorUserId,
      db: context.db,
      input: productInput(context.rangeId, [standard('Base Assembly'), optional('Dust Extraction Kit', 8_750)], {
        modelCode: 'B2',
        name: 'Bagger 2',
      }),
    });
    const removed = await createProduct({
      actorUserId,
      db: context.db,
      input: productInput(context.rangeId, [standard('Removed Frame')], {
        modelCode: 'REM',
        name: 'Removed Product',
      }),
    });
    await removeProduct({ actorUserId, db: context.db, id: removed.id });

    const rows = await exportProductAssemblies({ db: context.db });

    expect(rows).toEqual([
      {
        assemblyName: 'Main Frame',
        assemblyPrice: null,
        assemblyType: 'standard',
        productModelCode: 'AL6',
        productName: 'Auger Loader 6',
      },
      {
        assemblyName: 'Extended Hopper',
        assemblyPrice: '12500.00',
        assemblyType: 'optional',
        productModelCode: 'AL6',
        productName: 'Auger Loader 6',
      },
      {
        assemblyName: 'Base Assembly',
        assemblyPrice: null,
        assemblyType: 'standard',
        productModelCode: 'B2',
        productName: 'Bagger 2',
      },
      {
        assemblyName: 'Dust Extraction Kit',
        assemblyPrice: '8750.00',
        assemblyType: 'optional',
        productModelCode: 'B2',
        productName: 'Bagger 2',
      },
    ]);
  });

  test('returns no rows when products have no assemblies', async ({ context }) => {
    await createProduct({
      actorUserId,
      db: context.db,
      input: productInput(context.rangeId, [], {
        modelCode: 'EMPTY',
        name: 'Empty Product',
      }),
    });

    await expect(exportProductAssemblies({ db: context.db })).resolves.toEqual([]);
  });
});

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Test User',
    role: 'admin',
    updatedAt: now,
  });
}
