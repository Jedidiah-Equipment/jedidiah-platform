import { user } from '@pkg/db';
import type { ContractingRole } from '@pkg/schema';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Rate admin',
    email: 'rate-admin@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { db };
});

function contractingSession(role: ContractingRole) {
  const session = mockSession(null);
  session.user.contractingRole = role;
  return session;
}

test('allows only contracting-admin and super-admin across the complete Rate Card API', async ({ context }) => {
  const id = '00000000-0000-4000-8000-000000000000';
  const forbidden = [
    mockSession('admin'),
    ...(
      ['contracting-manager', 'workshop-manager', 'foreman', 'contracting-invoicing', 'driver', 'mechanic'] as const
    ).map(contractingSession),
  ];
  for (const session of forbidden) {
    const card = context.createCaller(session).contractingRateCard;
    for (const operation of [
      () => card.rates.list(),
      () => card.rates.options(),
      () => card.rates.get({ id }),
      () => card.rates.create({ name: 'No', basis: 'time', measureTypeId: null, amount: 1 }),
      () => card.rates.patch({ id, active: false }),
      () => card.rates.reorder({ orderedIds: [id] }),
      () => card.rates.remove({ id }),
      () => card.measureTypes.list(),
      () => card.measureTypes.get({ id }),
      () => card.measureTypes.create({ name: 'No' }),
      () => card.measureTypes.patch({ id, name: 'No' }),
      () => card.measureTypes.reorder({ orderedIds: [id] }),
      () => card.measureTypes.remove({ id }),
    ])
      await expect(operation()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
  await expect(context.createAnonCaller().contractingRateCard.rates.list()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });

  for (const [index, session] of [contractingSession('contracting-admin'), mockSession('super-admin')].entries()) {
    const card = context.createCaller(session).contractingRateCard;
    const measureType = await card.measureTypes.create({ name: `Hectares ${index}` });
    const rate = await card.rates.create({
      name: `Per hectare ${index}`,
      basis: 'measure',
      measureTypeId: measureType.id,
      amount: 250,
    });
    expect(await card.rates.get({ id: rate.id })).toMatchObject({ measureTypeName: measureType.name });
    await card.rates.patch({ id: rate.id, active: false });
    expect((await card.rates.options()).map((row) => row.id)).not.toContain(rate.id);
  }
});

test('preserves display order and surfaces public conflict messages', async ({ context }) => {
  const card = context.createCaller(contractingSession('contracting-admin')).contractingRateCard;
  const hectare = await card.measureTypes.create({ name: 'Hectares' });
  const hourly = await card.rates.create({ name: 'Hourly', basis: 'time', measureTypeId: null, amount: 500 });
  const measured = await card.rates.create({
    name: 'Per hectare',
    basis: 'measure',
    measureTypeId: hectare.id,
    amount: 250,
  });
  await expect(
    card.rates.create({ name: 'HOURLY', basis: 'time', measureTypeId: null, amount: 1 }),
  ).rejects.toMatchObject({
    code: 'CONFLICT',
    appCode: 'rate_card.duplicate',
    message: 'A rate with that name already exists.',
  });
  await expect(card.measureTypes.remove({ id: hectare.id })).rejects.toMatchObject({
    code: 'CONFLICT',
    appCode: 'rate_card.in_use',
    message: 'This measure type is used by a rate. Remove it from those rates first.',
  });
  expect((await card.rates.reorder({ orderedIds: [measured.id, hourly.id] })).map((rate) => rate.id)).toEqual([
    measured.id,
    hourly.id,
  ]);
  expect((await card.rates.options()).map((rate) => rate.id)).toEqual([measured.id, hourly.id]);
});
