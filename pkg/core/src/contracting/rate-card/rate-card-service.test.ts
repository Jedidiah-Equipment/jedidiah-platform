import { auditEvents, user } from '@pkg/db';
import { contractingRates } from '@pkg/db/contracting';
import { RateCreateInput } from '@pkg/schema/contracting';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import {
  createMeasureType,
  getMeasureType,
  listMeasureTypes,
  patchMeasureType,
  removeMeasureType,
  reorderMeasureTypes,
} from './measure-type-service.js';
import { createRate, listRates, patchRate, rateOptions, removeRate, reorderRates } from './rate-service.js';

const actorUserId = 'rate-card-actor';
const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: actorUserId,
    name: 'Rate admin',
    email: 'rate-card@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { actorUserId };
});

describe('Rate Card ordering', () => {
  test('appends, reorders, and rejects stale or duplicate order payloads without changing the list', async ({
    context: { db },
  }) => {
    const first = await createRate({
      db,
      actorUserId,
      input: { name: 'First', basis: 'time', measureTypeId: null, amount: 100 },
    });
    const second = await createRate({
      db,
      actorUserId,
      input: { name: 'Second', basis: 'time', measureTypeId: null, amount: 200 },
    });
    const third = await createRate({
      db,
      actorUserId,
      input: { name: 'Third', basis: 'time', measureTypeId: null, amount: 300 },
    });
    const rates = [first, second, third];
    expect(rates.map((rate) => rate.displayOrder)).toEqual([0, 1, 2]);
    const reversedIds = rates.map((rate) => rate.id).reverse();
    expect((await reorderRates({ db, input: { orderedIds: reversedIds } })).map((rate) => rate.id)).toEqual(
      reversedIds,
    );
    for (const orderedIds of [
      [first.id, second.id],
      [first.id, first.id, third.id],
    ])
      await expect(reorderRates({ db, input: { orderedIds } })).rejects.toMatchObject({
        code: 'rate_card.reorder_mismatch',
      });
    expect((await listRates({ db })).map((rate) => rate.id)).toEqual(reversedIds);
  });

  test('reorders Measure Types using the same complete-set contract', async ({ context: { db } }) => {
    const hectare = await createMeasureType({ db, actorUserId, input: { name: 'Hectares' } });
    const loads = await createMeasureType({ db, actorUserId, input: { name: 'Loads' } });
    expect(
      (await reorderMeasureTypes({ db, input: { orderedIds: [loads.id, hectare.id] } })).map((row) => row.id),
    ).toEqual([loads.id, hectare.id]);
  });
});

describe('Rate Card rules', () => {
  test('keeps time and measure Rates together and hides only inactive Rates from options', async ({
    context: { db },
  }) => {
    const hectare = await createMeasureType({ db, actorUserId, input: { name: 'Hectares' } });
    const hourly = await createRate({
      db,
      actorUserId,
      input: { name: 'Hourly', basis: 'time', measureTypeId: null, amount: 500 },
    });
    const perHectare = await createRate({
      db,
      actorUserId,
      input: { name: 'Per hectare', basis: 'measure', measureTypeId: hectare.id, amount: 250 },
    });
    await patchRate({ db, actorUserId, input: { id: hourly.id, active: false } });
    expect((await listRates({ db })).map((rate) => rate.id)).toEqual([hourly.id, perHectare.id]);
    expect((await rateOptions({ db })).map((rate) => rate.id)).toEqual([perHectare.id]);
    expect((await getMeasureType({ db, id: hectare.id })).inUse).toBe(true);
  });

  test('translates duplicate names and refuses deleting a Measure Type used by a Rate', async ({ context: { db } }) => {
    const hectare = await createMeasureType({ db, actorUserId, input: { name: 'Hectares' } });
    await expect(createMeasureType({ db, actorUserId, input: { name: 'HECTARES' } })).rejects.toMatchObject({
      code: 'rate_card.duplicate',
    });
    await createRate({
      db,
      actorUserId,
      input: { name: 'Per hectare', basis: 'measure', measureTypeId: hectare.id, amount: 250 },
    });
    await expect(removeMeasureType({ db, actorUserId, id: hectare.id })).rejects.toMatchObject({
      code: 'rate_card.in_use',
    });
  });

  test('the schema and database independently refuse invalid basis and amount shapes', async ({ context: { db } }) => {
    expect(RateCreateInput.safeParse({ name: 'No charge', basis: 'time', amount: 0 }).success).toBe(false);
    await expect(
      db.insert(contractingRates).values({
        name: 'Broken basis',
        basis: 'measure',
        measureTypeId: null,
        amount: 10,
        displayOrder: 0,
      }),
    ).rejects.toBeDefined();
    await expect(
      db.insert(contractingRates).values({
        name: 'Zero',
        basis: 'time',
        measureTypeId: null,
        amount: 0,
        displayOrder: 0,
      }),
    ).rejects.toBeDefined();
  });
});

test('creates one audit event per mutation and skips unchanged patches and reorders', async ({ context: { db } }) => {
  const measureType = await createMeasureType({ db, actorUserId, input: { name: 'Loads' } });
  await patchMeasureType({ db, actorUserId, input: { id: measureType.id, name: 'Loads' } });
  const rate = await createRate({
    db,
    actorUserId,
    input: { name: 'Per load', basis: 'measure', measureTypeId: measureType.id, amount: 500 },
  });
  await patchRate({ db, actorUserId, input: { id: rate.id, amount: 600 } });
  await patchRate({ db, actorUserId, input: { id: rate.id, amount: 600 } });
  await reorderRates({ db, input: { orderedIds: [rate.id] } });
  await removeRate({ db, actorUserId, id: rate.id });
  await removeMeasureType({ db, actorUserId, id: measureType.id });
  expect((await db.select().from(auditEvents)).map((row) => [row.entityType, row.action])).toEqual([
    ['contracting_measure_type', 'created'],
    ['contracting_rate', 'created'],
    ['contracting_rate', 'updated'],
    ['contracting_rate', 'deleted'],
    ['contracting_measure_type', 'deleted'],
  ]);
  expect(await listMeasureTypes({ db })).toEqual([]);
});
