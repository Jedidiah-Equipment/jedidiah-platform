import { user } from '@pkg/db';
import { createUserAccessSummaryForUser } from '@pkg/domain';
import { LaborRateCardUpdateInput } from '@pkg/schema/equipment';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { db };
});

test('billing is available to any signed-in user without exposing internal costs', async ({ context }) => {
  await expect(context.createAnonCaller().laborRates.billing()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  for (const role of ['sales', 'admin', null] as const) {
    const card = await context.createCaller(mockSession(role)).laborRates.billing();
    expect(card).toEqual({
      hoursPerWorkingDay: 9,
      rates: [
        { department: 'fabrication', billingRate: 550 },
        { department: 'supply', billingRate: null },
        { department: 'paint', billingRate: 375 },
        { department: 'assembly', billingRate: 320 },
        { department: 'workshop', billingRate: 320 },
      ],
    });
  }
});

test('requires rate permissions and redacts cost fields independently', async ({ context }) => {
  await expect(context.createAnonCaller().laborRates.get()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  const admin = context.createCaller();
  const card = await admin.laborRates.get();
  expect(card.rates.find((rate) => rate.department === 'assembly')).toMatchObject({
    costToCompanyRate: 80,
    consumablesPercentage: 20,
  });
  const sales = context.createCaller(mockSession('sales'));
  await expect(sales.laborRates.get()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(sales.laborRates.update(LaborRateCardUpdateInput.parse(card))).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  const access = createUserAccessSummaryForUser(mockSession().user);
  access.permissions = access.permissions.filter((permission) => permission !== 'equipment_inventory_cost:read');
  const restricted = context.createCaller(mockSession(), { access });
  const visible = await restricted.laborRates.get();
  expect(visible).not.toHaveProperty('managementOverheadPercentage');
  for (const rate of visible.rates) {
    expect(rate).not.toHaveProperty('costToCompanyRate');
    expect(rate).not.toHaveProperty('consumablesPercentage');
  }
});

test('saves the card atomically, audits changed fields, and skips unchanged saves', async ({ context }) => {
  const caller = context.createCaller(mockSession('super-admin'));
  const card = LaborRateCardUpdateInput.parse(await caller.laborRates.get());
  const paint = card.rates.find((rate) => rate.department === 'paint');
  if (!paint) throw new Error('Paint rate missing');
  paint.billingRate = 410.25;
  paint.costToCompanyRate = 75;
  paint.consumablesPercentage = 125;
  card.hoursPerWorkingDay = 8;
  card.managementOverheadPercentage = 150;
  expect(await caller.laborRates.update(card)).toEqual(card);
  await caller.laborRates.update(card);
  const events = (await caller.audit.list({ filters: { entityTypes: ['labor_rate_card'] } })).items;
  expect(events).toHaveLength(2);
  expect(events.find((event) => event.entityId === 'paint')).toMatchObject({
    actorUserId: 'test-user-id',
    action: 'updated',
    changes: {
      billingRate: { from: 375, to: 410.25 },
      costToCompanyRate: { from: 65, to: 75 },
      consumablesPercentage: { from: 40, to: 125 },
    },
  });
  expect(events.find((event) => event.entityId === 'labor-rate-card')?.changes).toEqual({
    hoursPerWorkingDay: { from: 9, to: 8 },
    managementOverheadPercentage: { from: 50, to: 150 },
  });
  expect(await caller.laborRates.billing()).toMatchObject({
    hoursPerWorkingDay: 8,
    rates: expect.arrayContaining([{ department: 'paint', billingRate: 410.25 }]),
  });
  for (const invalid of [
    { ...card, hoursPerWorkingDay: 0 },
    { ...card, hoursPerWorkingDay: 25 },
    { ...card, managementOverheadPercentage: -1 },
    { ...card, rates: card.rates.map((rate) => ({ ...rate, billingRate: -1 })) },
    { ...card, rates: card.rates.map((rate) => ({ ...rate, costToCompanyRate: 1.001 })) },
    { ...card, rates: card.rates.map((rate) => ({ ...rate, consumablesPercentage: -1 })) },
    { ...card, rates: card.rates.map(() => paint) },
  ]) {
    await expect(caller.laborRates.update(invalid)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  }
  expect(await caller.laborRates.get()).toEqual(card);
});
