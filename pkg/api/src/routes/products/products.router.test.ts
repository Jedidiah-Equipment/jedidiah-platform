import { auditEvents, type Db, jobBays, parts, productRanges, sql, supplier, user } from '@pkg/db';
import { EMPTY_PRODUCT_IMAGES, type Product } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { createProductRangeFixture } from '@/test/product-range-fixtures.js';
import { expectIsoDatetime, mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const rangeId = await createProductRangeFixture(db);

  return { db, rangeId };
});

const THUMBNAIL_DATA_URL = 'data:image/webp;base64,aaaa';

async function createProduct(
  caller: AppRouterCaller,
  name: string,
  rangeId: string,
  overrides: Partial<Parameters<AppRouterCaller['products']['create']>[0]> = {},
): Promise<Product> {
  return caller.products.create({
    basePrice: 1_000,
    description: null,
    buildTimeDays: 14,
    modelCode: createModelCode(name),
    name,
    rangeId,
    ...overrides,
  });
}

function createModelCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

describe('products.create', () => {
  test('creates products', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Wheel Loader', context.rangeId);

    expect(created).toMatchObject({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'WHEEL-LOADER',
      name: 'Wheel Loader',
      productBays: [],
      rangeId: context.rangeId,
      requiresVinNumber: false,
    });
    expectIsoDatetime(created.createdAt);
    expectIsoDatetime(created.updatedAt);
  });

  test('rejects creating products without a Range', async ({ context }) => {
    const caller = context.createCaller();

    await expect(
      caller.products.create({
        basePrice: 1_000,
        description: null,
        buildTimeDays: 14,
        modelCode: 'NO-RANGE',
        name: 'No Range',
      } as Parameters<AppRouterCaller['products']['create']>[0]),
    ).rejects.toThrow();
  });

  test('creates products with a selected Range', async ({ context }) => {
    const caller = context.createCaller();
    const range = await createRange(context.db, {
      id: '00000000-0000-4000-8000-000000000501',
      name: 'Earthmoving',
    });

    const created = await createProduct(caller, 'Wheel Loader Range', context.rangeId, { rangeId: range.id });

    expect(created).toMatchObject({
      name: 'Wheel Loader Range',
      rangeId: range.id,
    });
    await expect(caller.products.get({ id: created.id })).resolves.toMatchObject({ rangeId: range.id });
  });

  test('rejects negative build time days', async ({ context }) => {
    const caller = context.createCaller();

    await expect(
      caller.products.create({
        basePrice: 1_000,
        description: null,
        buildTimeDays: -1,
        modelCode: 'NEGATIVE-LEAD-TIME',
        name: 'Negative Lead Time',
        rangeId: context.rangeId,
      }),
    ).rejects.toThrow();
  });

  test('creates products with assemblies, parts, and overrides', async ({ context }) => {
    const caller = context.createCaller();
    const partIds = await createParts(context.db);
    const standardAssemblyId = '00000000-0000-4000-8000-000000000201';

    const created = await createProduct(caller, 'Wheel Loader Assemblies', context.rangeId, {
      assemblies: [
        {
          id: standardAssemblyId,
          kind: 'standard',
          name: 'Standard bucket',
          parts: [{ partId: partIds.bucket, quantity: 1 }],
        },
        {
          id: '00000000-0000-4000-8000-000000000202',
          kind: 'optional',
          name: 'Rock bucket',
          overrideStandardAssemblyIds: [standardAssemblyId],
          parts: [{ partId: partIds.rockBucket, quantity: 1 }],
          price: 250,
        },
      ],
    });

    expect(created.assemblies).toEqual([
      expect.objectContaining({
        id: standardAssemblyId,
        kind: 'standard',
        name: 'Standard bucket',
        parts: [{ partId: partIds.bucket, quantity: 1 }],
      }),
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000202',
        kind: 'optional',
        name: 'Rock bucket',
        overrideStandardAssemblyIds: [standardAssemblyId],
        parts: [{ partId: partIds.rockBucket, quantity: 1 }],
        price: 250,
      }),
    ]);
  });

  test('creates products with Product Bays and keeps them decoupled from build time days', async ({ context }) => {
    const caller = context.createCaller();
    const assemblyBayId = await createBay(context.db, {
      department: 'assembly',
      id: '00000000-0000-4000-8000-000000000401',
      name: 'Assembly Bay 1',
    });
    const fabricationBayId = await createBay(context.db, {
      department: 'fabrication',
      id: '00000000-0000-4000-8000-000000000402',
      name: 'Fabrication Bay 1',
    });

    const created = await createProduct(caller, 'Wheel Loader Product Bays', context.rangeId, {
      buildTimeDays: 1,
      productBays: [
        { bayId: assemblyBayId, defaultWorkingDays: 7 },
        { bayId: fabricationBayId, defaultWorkingDays: 5 },
      ],
    });

    expect(created.productBays).toEqual([
      expect.objectContaining({
        bayId: fabricationBayId,
        defaultWorkingDays: 5,
        bay: expect.objectContaining({ department: 'fabrication', name: 'Fabrication Bay 1' }),
      }),
      expect.objectContaining({
        bayId: assemblyBayId,
        defaultWorkingDays: 7,
        bay: expect.objectContaining({ department: 'assembly', name: 'Assembly Bay 1' }),
      }),
    ]);
  });

  test('rejects duplicate and disabled Product Bays', async ({ context }) => {
    const caller = context.createCaller();
    const bayId = await createBay(context.db, {
      department: 'paint',
      id: '00000000-0000-4000-8000-000000000403',
      name: 'Paint Bay 1',
    });
    const disabledBayId = await createBay(context.db, {
      department: 'paint',
      disabledAt: new Date(),
      id: '00000000-0000-4000-8000-000000000404',
      name: 'Paint Bay Disabled',
    });

    await expect(
      createProduct(caller, 'Wheel Loader Duplicate Product Bay', context.rangeId, {
        productBays: [
          { bayId, defaultWorkingDays: 5 },
          { bayId, defaultWorkingDays: 7 },
        ],
      }),
    ).rejects.toThrow('Bay can only be added once per product');

    await expect(
      createProduct(caller, 'Wheel Loader Disabled Product Bay', context.rangeId, {
        productBays: [{ bayId: disabledBayId, defaultWorkingDays: 5 }],
      }),
    ).rejects.toThrow('Only enabled Bays can be added to Product Bays.');
  });
});

describe('products.read', () => {
  test('lists Range options through Product read access', async ({ context }) => {
    await createRange(context.db, {
      id: '00000000-0000-4000-8000-000000000502',
      name: 'Earthmoving',
    });
    const caller = context.createCaller(mockSession('procurement-manager'));

    const result = await caller.products.rangeOptions();

    expect(result.ranges).toContainEqual({ id: '00000000-0000-4000-8000-000000000502', name: 'Earthmoving' });
    expect(result.ranges.every((range) => Object.keys(range).sort().join(',') === 'id,name')).toBe(true);
  });

  test('returns distinct assembly names through Product read access', async ({ context }) => {
    const caller = context.createCaller();
    await createProduct(caller, 'Assembly Names A', context.rangeId, {
      assemblies: [
        { kind: 'standard', name: 'Hydraulics', parts: [] },
        { kind: 'optional', name: 'Canopy', overrideStandardAssemblyIds: [], parts: [], price: 100 },
      ],
    });
    await createProduct(caller, 'Assembly Names B', context.rangeId, {
      assemblies: [
        { kind: 'standard', name: 'hydraulics', parts: [] },
        { kind: 'standard', name: 'Bucket', parts: [] },
      ],
    });

    const result = await caller.products.assemblyNames();

    expect(result.names).toHaveLength(3);
    expect(result.names.map((name) => name.toLowerCase())).toEqual(['bucket', 'canopy', 'hydraulics']);
  });

  test('rejects unauthorized assembly name reads', async ({ context }) => {
    await expect(context.createCaller(mockSession('sales')).products.assemblyNames()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('returns build time days and VIN requirement on get and list', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Wheel Loader Read', context.rangeId, {
      buildTimeDays: 21,
      requiresVinNumber: true,
    });

    await expect(caller.products.get({ id: created.id })).resolves.toMatchObject({
      id: created.id,
      buildTimeDays: 21,
      requiresVinNumber: true,
    });

    const list = await caller.products.list({
      page: 1,
      pageSize: 10,
    });

    expect(list.items).toContainEqual(
      expect.objectContaining({ id: created.id, buildTimeDays: 21, requiresVinNumber: true }),
    );
  });

  test('returns assemblies on get and list', async ({ context }) => {
    const caller = context.createCaller();
    const partIds = await createParts(context.db);
    const created = await createProduct(caller, 'Wheel Loader Assembly Read', context.rangeId, {
      assemblies: [
        {
          id: '00000000-0000-4000-8000-000000000211',
          kind: 'standard',
          name: 'Standard hydraulics',
          parts: [{ partId: partIds.hose, quantity: 2 }],
        },
      ],
    });

    await expect(caller.products.get({ id: created.id })).resolves.toMatchObject({
      id: created.id,
      assemblies: [
        expect.objectContaining({
          kind: 'standard',
          name: 'Standard hydraulics',
          parts: [{ partId: partIds.hose, quantity: 2 }],
        }),
      ],
    });

    const list = await caller.products.list({
      page: 1,
      pageSize: 10,
    });

    expect(list.items).toContainEqual(
      expect.objectContaining({
        id: created.id,
        assemblies: [
          expect.objectContaining({
            kind: 'standard',
            name: 'Standard hydraulics',
          }),
        ],
      }),
    );
  });

  test('returns product thumbnails on get and list', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Thumbnail Product', context.rangeId, {
      thumbnailDataUrl: THUMBNAIL_DATA_URL,
    });

    await expect(caller.products.get({ id: created.id })).resolves.toMatchObject({
      id: created.id,
      thumbnailDataUrl: THUMBNAIL_DATA_URL,
    });

    await expect(caller.products.list({ search: 'Thumbnail' })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          id: created.id,
          thumbnailDataUrl: THUMBNAIL_DATA_URL,
        }),
      ],
    });
  });

  test('returns Product Bays on get and list', async ({ context }) => {
    const caller = context.createCaller();
    const bayId = await createBay(context.db, {
      department: 'supply',
      id: '00000000-0000-4000-8000-000000000405',
      name: 'Supply Bay 1',
    });
    const created = await createProduct(caller, 'Wheel Loader Product Bay Read', context.rangeId, {
      productBays: [{ bayId, defaultWorkingDays: 3 }],
    });

    await expect(caller.products.get({ id: created.id })).resolves.toMatchObject({
      id: created.id,
      productBays: [expect.objectContaining({ bayId, defaultWorkingDays: 3 })],
    });

    await expect(caller.products.list({ search: 'Product Bay Read' })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: created.id, productBays: [expect.objectContaining({ bayId })] })],
    });
  });
});

describe('products.update', () => {
  test('updates product catalog fields', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Wheel Loader Update', context.rangeId);

    const updated = await caller.products.update({
      id: created.id,
      basePrice: 2_000,
      currencyCode: 'ZAR',
      description: 'Updated',
      buildTimeDays: 30,
      modelCode: 'WHEEL-LOADER-UPDATED',
      name: 'Wheel Loader Updated',
      rangeId: created.rangeId,
      requiresVinNumber: true,
    });

    expect(updated).toMatchObject({
      basePrice: 2_000,
      description: 'Updated',
      buildTimeDays: 30,
      modelCode: 'WHEEL-LOADER-UPDATED',
      name: 'Wheel Loader Updated',
      requiresVinNumber: true,
    });
    const events = await context.db.select().from(auditEvents);
    expect(events).not.toHaveLength(0);
    expect(events).toContainEqual(
      expect.objectContaining({
        changes: expect.objectContaining({
          buildTimeDays: {
            from: 14,
            to: 30,
          },
          requiresVinNumber: {
            from: false,
            to: true,
          },
        }),
      }),
    );
  });

  test('updates product Range', async ({ context }) => {
    const adminCaller = context.createCaller();
    const procurementCaller = context.createCaller(mockSession('procurement-manager'));
    const range = await createRange(context.db, {
      id: '00000000-0000-4000-8000-000000000503',
      name: 'Earthmoving',
    });
    const created = await createProduct(adminCaller, 'Wheel Loader Range Update', context.rangeId);

    const updated = await procurementCaller.products.update({
      id: created.id,
      basePrice: created.basePrice,
      currencyCode: created.currencyCode,
      description: created.description,
      buildTimeDays: created.buildTimeDays,
      modelCode: created.modelCode,
      name: created.name,
      rangeId: range.id,
      requiresVinNumber: created.requiresVinNumber,
    });

    expect(updated.rangeId).toBe(range.id);
    await expect(adminCaller.products.get({ id: created.id })).resolves.toMatchObject({ rangeId: range.id });
  });

  test('updates and removes product thumbnails with audit changes', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Thumbnail Audit Product', context.rangeId, {
      thumbnailDataUrl: THUMBNAIL_DATA_URL,
    });

    const updated = await caller.products.update({
      assemblies: created.assemblies,
      basePrice: created.basePrice,
      currencyCode: created.currencyCode,
      description: created.description,
      buildTimeDays: created.buildTimeDays,
      id: created.id,
      modelCode: created.modelCode,
      name: created.name,
      rangeId: created.rangeId,
      requiresVinNumber: created.requiresVinNumber,
      thumbnailDataUrl: null,
    });

    expect(updated.thumbnailDataUrl).toBeNull();

    const events = await context.db.select().from(auditEvents);
    expect(events.at(-1)).toMatchObject({
      action: 'updated',
      changes: {
        thumbnailDataUrl: {
          from: THUMBNAIL_DATA_URL,
          to: null,
        },
      },
      entityId: created.id,
      entityType: 'product',
    });
  });

  test('updates assembly composition and records product audit changes', async ({ context }) => {
    const caller = context.createCaller();
    const partIds = await createParts(context.db);
    const standardAssemblyId = '00000000-0000-4000-8000-000000000221';
    const created = await createProduct(caller, 'Wheel Loader Assembly Update', context.rangeId, {
      assemblies: [
        {
          id: standardAssemblyId,
          kind: 'standard',
          name: 'Standard bucket',
          parts: [{ partId: partIds.bucket, quantity: 1 }],
        },
      ],
    });

    const updated = await caller.products.update({
      id: created.id,
      assemblies: [
        {
          id: standardAssemblyId,
          kind: 'standard',
          name: 'Standard bucket renamed',
          parts: [{ partId: partIds.bucket, quantity: 2 }],
        },
      ],
      basePrice: created.basePrice,
      currencyCode: 'ZAR',
      description: created.description,
      buildTimeDays: created.buildTimeDays,
      modelCode: created.modelCode,
      name: created.name,
      rangeId: created.rangeId,
      requiresVinNumber: created.requiresVinNumber,
    });

    expect(updated.assemblies).toContainEqual(
      expect.objectContaining({
        id: standardAssemblyId,
        name: 'Standard bucket renamed',
        parts: [{ partId: partIds.bucket, quantity: 2 }],
      }),
    );
    const events = await context.db.select().from(auditEvents);
    expect(events).toContainEqual(
      expect.objectContaining({
        changes: expect.objectContaining({
          assemblies: expect.any(Object),
        }),
        entityType: 'product',
      }),
    );
  });

  test('replaces, removes, audits, and preserves disabled existing Product Bays', async ({ context }) => {
    const caller = context.createCaller();
    const firstBayId = await createBay(context.db, {
      department: 'fabrication',
      id: '00000000-0000-4000-8000-000000000406',
      name: 'Fabrication Bay 2',
    });
    const secondBayId = await createBay(context.db, {
      department: 'assembly',
      id: '00000000-0000-4000-8000-000000000407',
      name: 'Assembly Bay 2',
    });
    const created = await createProduct(caller, 'Wheel Loader Product Bay Update', context.rangeId, {
      productBays: [{ bayId: firstBayId, defaultWorkingDays: 5 }],
    });

    await context.db.update(jobBays).set({ disabledAt: new Date() }).where(sql`${jobBays.id} = ${firstBayId}`);

    const retainedDisabled = await caller.products.update({
      id: created.id,
      assemblies: created.assemblies,
      basePrice: created.basePrice,
      currencyCode: created.currencyCode,
      description: created.description,
      buildTimeDays: 1,
      modelCode: created.modelCode,
      name: created.name,
      productBays: productBayInputs(created),
      rangeId: created.rangeId,
      requiresVinNumber: created.requiresVinNumber,
      thumbnailDataUrl: created.thumbnailDataUrl,
    });

    expect(retainedDisabled.productBays).toEqual([
      expect.objectContaining({
        bayId: firstBayId,
        defaultWorkingDays: 5,
        bay: expect.objectContaining({ disabledAt: expect.any(String) }),
      }),
    ]);

    const replaced = await caller.products.update({
      id: created.id,
      assemblies: retainedDisabled.assemblies,
      basePrice: retainedDisabled.basePrice,
      currencyCode: retainedDisabled.currencyCode,
      description: retainedDisabled.description,
      buildTimeDays: retainedDisabled.buildTimeDays,
      modelCode: retainedDisabled.modelCode,
      name: retainedDisabled.name,
      productBays: [{ bayId: secondBayId, defaultWorkingDays: 8 }],
      rangeId: retainedDisabled.rangeId,
      requiresVinNumber: retainedDisabled.requiresVinNumber,
      thumbnailDataUrl: retainedDisabled.thumbnailDataUrl,
    });

    expect(replaced.productBays).toEqual([expect.objectContaining({ bayId: secondBayId, defaultWorkingDays: 8 })]);
    expect((await caller.products.get({ id: created.id })).productBays).toEqual(replaced.productBays);

    const removed = await caller.products.update({
      id: created.id,
      assemblies: replaced.assemblies,
      basePrice: replaced.basePrice,
      currencyCode: replaced.currencyCode,
      description: replaced.description,
      buildTimeDays: replaced.buildTimeDays,
      modelCode: replaced.modelCode,
      name: replaced.name,
      productBays: [],
      rangeId: replaced.rangeId,
      requiresVinNumber: replaced.requiresVinNumber,
      thumbnailDataUrl: replaced.thumbnailDataUrl,
    });

    expect(removed.productBays).toEqual([]);
    const events = await context.db.select().from(auditEvents);
    expect(events).toContainEqual(
      expect.objectContaining({
        changes: expect.objectContaining({
          productBays: expect.any(Object),
        }),
        entityType: 'product',
      }),
    );
  });

  test('preserves child collections when update omits them', async ({ context }) => {
    const caller = context.createCaller();
    const partIds = await createParts(context.db);
    const bayId = await createBay(context.db, {
      department: 'fabrication',
      id: '00000000-0000-4000-8000-000000000408',
      name: 'Fabrication Bay Preserve',
    });
    const created = await createProduct(caller, 'Wheel Loader Preserve Assemblies', context.rangeId, {
      assemblies: [
        {
          id: '00000000-0000-4000-8000-000000000231',
          kind: 'standard',
          name: 'Standard bucket',
          parts: [{ partId: partIds.bucket, quantity: 1 }],
        },
      ],
      productBays: [{ bayId, defaultWorkingDays: 4 }],
    });

    const updated = await caller.products.update({
      id: created.id,
      basePrice: 2_000,
      currencyCode: 'ZAR',
      description: created.description,
      buildTimeDays: created.buildTimeDays,
      modelCode: created.modelCode,
      name: 'Wheel Loader Preserve Assemblies Updated',
      rangeId: created.rangeId,
      requiresVinNumber: created.requiresVinNumber,
    });

    expect(updated.assemblies).toEqual(created.assemblies);
    expect(updated.productBays).toEqual(created.productBays);
  });

  test('rejects duplicate override targets before insert', async ({ context }) => {
    const caller = context.createCaller();
    const partIds = await createParts(context.db);
    const standardAssemblyId = '00000000-0000-4000-8000-000000000241';

    await expect(
      createProduct(caller, 'Wheel Loader Duplicate Overrides', context.rangeId, {
        assemblies: [
          {
            id: standardAssemblyId,
            kind: 'standard',
            name: 'Standard bucket',
            parts: [{ partId: partIds.bucket, quantity: 1 }],
          },
          {
            id: '00000000-0000-4000-8000-000000000242',
            kind: 'optional',
            name: 'Rock bucket',
            overrideStandardAssemblyIds: [standardAssemblyId, standardAssemblyId],
            parts: [{ partId: partIds.rockBucket, quantity: 1 }],
            price: 250,
          },
        ],
      }),
    ).rejects.toThrow();
  });

  test('rejects assembly ids from a different product', async ({ context }) => {
    const caller = context.createCaller();
    const partIds = await createParts(context.db);
    const foreignAssemblyId = '00000000-0000-4000-8000-000000000251';
    await createProduct(caller, 'Wheel Loader Foreign Source', context.rangeId, {
      assemblies: [
        {
          id: foreignAssemblyId,
          kind: 'standard',
          name: 'Standard bucket',
          parts: [{ partId: partIds.bucket, quantity: 1 }],
        },
      ],
    });
    const target = await createProduct(caller, 'Wheel Loader Foreign Target', context.rangeId);

    await expect(
      caller.products.update({
        id: target.id,
        assemblies: [
          {
            id: foreignAssemblyId,
            kind: 'standard',
            name: 'Stolen bucket',
            parts: [{ partId: partIds.bucket, quantity: 1 }],
          },
        ],
        basePrice: target.basePrice,
        currencyCode: 'ZAR',
        description: target.description,
        buildTimeDays: target.buildTimeDays,
        modelCode: target.modelCode,
        name: target.name,
        rangeId: target.rangeId,
        requiresVinNumber: target.requiresVinNumber,
      }),
    ).rejects.toThrow('Assemblies must belong to the product being updated.');
  });
});

describe('products marketing fields', () => {
  test('defaults to empty marketing fields on create and read', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Marketing Default Product', context.rangeId);

    expect(created).toMatchObject({ category: null, images: EMPTY_PRODUCT_IMAGES, keyFeatures: [] });
    await expect(caller.products.get({ id: created.id })).resolves.toMatchObject({
      category: null,
      keyFeatures: [],
    });
  });

  test('persists category and key features through update and read', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Marketing Text Product', context.rangeId);

    const updated = await caller.products.update({
      id: created.id,
      basePrice: created.basePrice,
      category: '  Silage & Grain  ',
      keyFeatures: ['  Heavy duty  ', 'Low maintenance'],
      currencyCode: 'ZAR',
      description: created.description,
      buildTimeDays: created.buildTimeDays,
      modelCode: created.modelCode,
      name: created.name,
      rangeId: created.rangeId,
      requiresVinNumber: created.requiresVinNumber,
    });

    expect(updated).toMatchObject({
      category: 'Silage & Grain',
      images: EMPTY_PRODUCT_IMAGES,
      keyFeatures: ['Heavy duty', 'Low maintenance'],
    });
    await expect(caller.products.get({ id: created.id })).resolves.toMatchObject({
      category: 'Silage & Grain',
      keyFeatures: ['Heavy duty', 'Low maintenance'],
    });

    const events = await context.db.select().from(auditEvents);
    expect(events).toContainEqual(
      expect.objectContaining({
        changes: expect.objectContaining({
          category: { from: null, to: 'Silage & Grain' },
          keyFeatures: { from: '[]', to: JSON.stringify(['Heavy duty', 'Low maintenance']) },
        }),
        entityType: 'product',
      }),
    );
  });

  test('reorders and removes key feature lines', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Marketing Reorder Product', context.rangeId);
    const baseInput = {
      id: created.id,
      basePrice: created.basePrice,
      currencyCode: 'ZAR' as const,
      description: created.description,
      buildTimeDays: created.buildTimeDays,
      modelCode: created.modelCode,
      name: created.name,
      rangeId: created.rangeId,
      requiresVinNumber: created.requiresVinNumber,
    };

    const seeded = await caller.products.update({ ...baseInput, keyFeatures: ['One', 'Two', 'Three'] });
    expect(seeded.keyFeatures).toEqual(['One', 'Two', 'Three']);

    const reordered = await caller.products.update({ ...baseInput, keyFeatures: ['Three', 'One'] });
    expect(reordered.keyFeatures).toEqual(['Three', 'One']);
  });

  test('preserves category and key features when the update omits them', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Marketing Preserve Product', context.rangeId);

    await caller.products.update({
      id: created.id,
      basePrice: created.basePrice,
      category: 'Kept',
      keyFeatures: ['Stays put'],
      currencyCode: 'ZAR',
      description: created.description,
      buildTimeDays: created.buildTimeDays,
      modelCode: created.modelCode,
      name: created.name,
      rangeId: created.rangeId,
      requiresVinNumber: created.requiresVinNumber,
    });

    const updatedWithoutMarketing = await caller.products.update({
      id: created.id,
      basePrice: 2_000,
      currencyCode: 'ZAR',
      description: created.description,
      buildTimeDays: created.buildTimeDays,
      modelCode: created.modelCode,
      name: created.name,
      rangeId: created.rangeId,
      requiresVinNumber: created.requiresVinNumber,
    });

    expect(updatedWithoutMarketing).toMatchObject({
      category: 'Kept',
      images: EMPTY_PRODUCT_IMAGES,
      keyFeatures: ['Stays put'],
    });
  });

  test('rejects blank and over-long key feature lines', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Marketing Validation Product', context.rangeId);
    const baseInput = {
      id: created.id,
      basePrice: created.basePrice,
      currencyCode: 'ZAR' as const,
      description: created.description,
      buildTimeDays: created.buildTimeDays,
      modelCode: created.modelCode,
      name: created.name,
      rangeId: created.rangeId,
      requiresVinNumber: created.requiresVinNumber,
    };

    await expect(caller.products.update({ ...baseInput, keyFeatures: ['   '] })).rejects.toThrow();

    await expect(caller.products.update({ ...baseInput, keyFeatures: ['x'.repeat(121)] })).rejects.toThrow();
  });
});

async function createActorUser(db: Db): Promise<void> {
  await db
    .insert(user)
    .values({
      id: 'test-user-id',
      email: 'actor@example.com',
      emailVerified: true,
      name: 'Actor',
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}

async function createRange(db: Db, input: { id: string; name: string }) {
  const [range] = await db
    .insert(productRanges)
    .values({
      id: input.id,
      name: input.name,
    })
    .returning();

  if (!range) {
    throw new Error('Product Range insert did not return a row');
  }

  return range;
}

async function createParts(db: Db): Promise<{ bucket: string; hose: string; rockBucket: string }> {
  const supplierId = '00000000-0000-4000-8000-000000000301';

  await db.insert(supplier).values({ companyName: 'Assembly Supplier', id: supplierId }).onConflictDoNothing();
  await db
    .insert(parts)
    .values([
      {
        id: '00000000-0000-4000-8000-000000000302',
        category: 'Bucket',
        code: 'BKT-STD',
        description: 'Standard bucket',
        finish: 'Painted',
        name: 'Standard bucket',
        supplierCode: 'BKT-STD',
        supplierId,
        unitOfMeasure: 'quantity',
      },
      {
        id: '00000000-0000-4000-8000-000000000303',
        category: 'Hydraulics',
        code: 'HSE-001',
        description: 'Hydraulic hose',
        finish: 'Rubber',
        name: 'Hydraulic hose',
        supplierCode: 'HSE-001',
        supplierId,
        unitOfMeasure: 'mm',
      },
      {
        id: '00000000-0000-4000-8000-000000000304',
        category: 'Bucket',
        code: 'BKT-ROCK',
        description: 'Rock bucket',
        finish: 'Painted',
        name: 'Rock bucket',
        supplierCode: 'BKT-ROCK',
        supplierId,
        unitOfMeasure: 'quantity',
      },
    ])
    .onConflictDoNothing();

  return {
    bucket: '00000000-0000-4000-8000-000000000302',
    hose: '00000000-0000-4000-8000-000000000303',
    rockBucket: '00000000-0000-4000-8000-000000000304',
  };
}

async function createBay(
  db: Db,
  input: {
    department: typeof jobBays.$inferInsert.department;
    disabledAt?: Date;
    id: string;
    name: string;
  },
): Promise<string> {
  const [bay] = await db
    .insert(jobBays)
    .values({
      department: input.department,
      disabledAt: input.disabledAt ?? null,
      id: input.id,
      name: input.name,
      scheduleOrigin: '2026-01-01',
    })
    .returning();

  if (!bay) {
    throw new Error('Bay insert did not return a row');
  }

  return bay.id;
}

function productBayInputs(
  product: Product,
): NonNullable<Parameters<AppRouterCaller['products']['update']>[0]['productBays']> {
  return product.productBays.map((productBay) => ({
    bayId: productBay.bayId,
    defaultWorkingDays: productBay.defaultWorkingDays,
  }));
}
