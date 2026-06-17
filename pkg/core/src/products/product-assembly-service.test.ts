import { type Db, productAssemblies, user } from '@pkg/db';
import type { AssemblyInput, ProductCreateInput } from '@pkg/schema';
import { asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { createProduct, getProduct, updateProduct } from './product-service.js';

const actorUserId = 'test-user-id';
const LEGACY_PRODUCT_RANGE_ID = '00000000-0000-4000-8000-000000000488';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

function standard(name: string): AssemblyInput {
  return { kind: 'standard', name, parts: [] };
}

function optional(name: string, price = 100): AssemblyInput {
  return { kind: 'optional', name, overrideStandardAssemblyIds: [], parts: [], price };
}

function productInput(assemblies: AssemblyInput[], overrides: Partial<ProductCreateInput> = {}): ProductCreateInput {
  return {
    assemblies,
    basePrice: 1000,
    brochureConfig: { keyFeatures: [], subtitle: null },
    buildTimeDays: 14,
    currencyCode: 'ZAR',
    description: null,
    modelCode: 'MODEL-1',
    name: 'Test Product',
    productBays: [],
    rangeId: LEGACY_PRODUCT_RANGE_ID,
    requiresVinNumber: false,
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
      input: productInput([standard('Zebra'), standard('Alpha'), optional('Yak'), optional('Beta')]),
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
      input: productInput([standard('Zebra'), standard('Alpha'), optional('Yak'), optional('Beta')]),
    });

    const product = await getProduct({ db: context.db, id: created.id });

    expect(product.assemblies.map((assembly) => assembly.name)).toEqual(['Zebra', 'Alpha', 'Yak', 'Beta']);
  });

  test('persists a reorder through update and survives a re-read', async ({ context }) => {
    const created = await createProduct({
      actorUserId,
      db: context.db,
      input: productInput([standard('Zebra'), standard('Alpha'), optional('Yak'), optional('Beta')]),
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
        rangeId: LEGACY_PRODUCT_RANGE_ID,
        requiresVinNumber: false,
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
