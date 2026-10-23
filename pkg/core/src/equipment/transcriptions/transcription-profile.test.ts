import { user } from '@pkg/db';
import { products, purchaseOrders, supplier } from '@pkg/db/equipment';
import type { EquipmentRole } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { equipmentTranscriptionProfile } from './transcription-profile.js';

const test = createTester();

test('names Equipment people, Departments, the catalogue and recent Suppliers, in that order', async ({
  context: { db },
}) => {
  const now = new Date('2026-10-23T08:00:00.000Z');
  const person = (
    id: string,
    name: string,
    role: EquipmentRole | null,
    extra: { isDevice?: boolean; banned?: boolean } = {},
  ) => ({ id, name, email: `${id}@example.com`, emailVerified: true, role, createdAt: now, updatedAt: now, ...extra });
  const roles: [EquipmentRole, string][] = [
    ['admin', 'Ada Admin'],
    ['super-admin', 'Bea Super'],
    ['procurement-manager', 'Cara Buyer'],
    ['job-manager', 'Dan Manager'],
    ['job-viewer', 'Eve Viewer'],
    ['sales', 'Fay Sales'],
    ['stores', 'Gus Stores'],
    ['bay-operator', 'Hal Welder'],
    ['app-store-tester', 'Ivy Reviewer'],
  ];
  await db
    .insert(user)
    .values([
      ...roles.map(([role, name]) => person(role, name, role)),
      person('tablet', 'Stores Tablet', 'stores', { isDevice: true }),
      person('gone', 'Banned Person', 'sales', { banned: true }),
      person('contractor', 'Sipho Foreman', null),
    ]);
  const rangeId = await createProductRangeFixture(db, 'Tippers');
  const [, deleted] = await db
    .insert(products)
    .values([
      { basePrice: 1000, buildTimeDays: 14, modelCode: 'TIP-6', name: 'Six-ton Tipper', rangeId },
      { basePrice: 1000, buildTimeDays: 14, modelCode: 'OLD-1', name: 'Old Trailer', rangeId },
    ])
    .returning();
  await db
    .update(products)
    .set({ deletedAt: now })
    .where(eq(products.id, deleted?.id ?? ''));
  const [recent, stale] = await db
    .insert(supplier)
    .values([{ companyName: 'Steel Africa' }, { companyName: 'Bygone Bolts' }])
    .returning();
  await db.insert(purchaseOrders).values([
    { supplierId: recent?.id ?? '', updatedAt: new Date('2026-10-22T08:00:00.000Z') },
    { supplierId: stale?.id ?? '', updatedAt: new Date('2026-06-01T08:00:00.000Z') },
  ]);

  const candidates = await equipmentTranscriptionProfile.loadVocabulary({ db, now });

  expect(candidates).toEqual([
    ...roles
      .filter(([role]) => role !== 'app-store-tester')
      .flatMap(([, name]) => [
        { keyterm: name, source: 'person' },
        { keyterm: name.split(' ')[0], source: 'person' },
      ]),
    ...['Procurement', 'Supply', 'Fabrication', 'Paint', 'Assembly', 'Workshop'].map((keyterm) => ({
      keyterm,
      source: 'department',
    })),
    { keyterm: 'Six-ton Tipper', source: 'product' },
    { keyterm: 'Tippers', source: 'product' },
    { keyterm: 'Steel Africa', source: 'supplier' },
  ]);
});
