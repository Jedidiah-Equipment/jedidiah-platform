import { auditEvents, type Db, parts, supplier, user } from '@pkg/db';
import type { Product } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { expectIsoDatetime } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

const THUMBNAIL_DATA_URL = 'data:image/webp;base64,aaaa';

async function createProduct(
  caller: AppRouterCaller,
  name: string,
  overrides: Partial<Parameters<AppRouterCaller['products']['create']>[0]> = {},
): Promise<Product> {
  return caller.products.create({
    basePrice: 1_000,
    description: null,
    buildTimeDays: 14,
    modelCode: createModelCode(name),
    name,
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
    const created = await createProduct(caller, 'Wheel Loader');

    expect(created).toMatchObject({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'WHEEL-LOADER',
      name: 'Wheel Loader',
      requiresVinNumber: false,
    });
    expectIsoDatetime(created.createdAt);
    expectIsoDatetime(created.updatedAt);
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
      }),
    ).rejects.toThrow();
  });

  test('creates products with assemblies, parts, and overrides', async ({ context }) => {
    const caller = context.createCaller();
    const partIds = await createParts(context.db);
    const standardAssemblyId = '00000000-0000-4000-8000-000000000201';

    const created = await createProduct(caller, 'Wheel Loader Assemblies', {
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
});

describe('products.read', () => {
  test('returns build time days and VIN requirement on get and list', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Wheel Loader Read', { buildTimeDays: 21, requiresVinNumber: true });

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
    const created = await createProduct(caller, 'Wheel Loader Assembly Read', {
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
    const created = await createProduct(caller, 'Thumbnail Product', { thumbnailDataUrl: THUMBNAIL_DATA_URL });

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
});

describe('products.update', () => {
  test('updates product catalog fields', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Wheel Loader Update');

    const updated = await caller.products.update({
      id: created.id,
      basePrice: 2_000,
      currencyCode: 'ZAR',
      description: 'Updated',
      buildTimeDays: 30,
      modelCode: 'WHEEL-LOADER-UPDATED',
      name: 'Wheel Loader Updated',
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

  test('updates and removes product thumbnails with audit changes', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, 'Thumbnail Audit Product', { thumbnailDataUrl: THUMBNAIL_DATA_URL });

    const updated = await caller.products.update({
      assemblies: created.assemblies,
      basePrice: created.basePrice,
      currencyCode: created.currencyCode,
      description: created.description,
      buildTimeDays: created.buildTimeDays,
      id: created.id,
      modelCode: created.modelCode,
      name: created.name,
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
    const created = await createProduct(caller, 'Wheel Loader Assembly Update', {
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

  test('preserves assemblies when update omits assembly composition', async ({ context }) => {
    const caller = context.createCaller();
    const partIds = await createParts(context.db);
    const created = await createProduct(caller, 'Wheel Loader Preserve Assemblies', {
      assemblies: [
        {
          id: '00000000-0000-4000-8000-000000000231',
          kind: 'standard',
          name: 'Standard bucket',
          parts: [{ partId: partIds.bucket, quantity: 1 }],
        },
      ],
    });

    const updated = await caller.products.update({
      id: created.id,
      basePrice: 2_000,
      currencyCode: 'ZAR',
      description: created.description,
      buildTimeDays: created.buildTimeDays,
      modelCode: created.modelCode,
      name: 'Wheel Loader Preserve Assemblies Updated',
      requiresVinNumber: created.requiresVinNumber,
    });

    expect(updated.assemblies).toEqual(created.assemblies);
  });

  test('rejects duplicate override targets before insert', async ({ context }) => {
    const caller = context.createCaller();
    const partIds = await createParts(context.db);
    const standardAssemblyId = '00000000-0000-4000-8000-000000000241';

    await expect(
      createProduct(caller, 'Wheel Loader Duplicate Overrides', {
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
    await createProduct(caller, 'Wheel Loader Foreign Source', {
      assemblies: [
        {
          id: foreignAssemblyId,
          kind: 'standard',
          name: 'Standard bucket',
          parts: [{ partId: partIds.bucket, quantity: 1 }],
        },
      ],
    });
    const target = await createProduct(caller, 'Wheel Loader Foreign Target');

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
        requiresVinNumber: target.requiresVinNumber,
      }),
    ).rejects.toThrow('Assemblies must belong to the product being updated.');
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
