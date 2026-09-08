import { sql, user } from '@pkg/db';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCustomer, getCustomer, listCustomers, patchCustomer } from './customer-service.js';

const actorUserId = 'directory-actor';
const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: actorUserId,
    name: 'Manager',
    email: 'directory@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { actorUserId };
});

test('keeps contracting customers independent and refuses case-insensitive duplicate names', async ({ context }) => {
  const { db, actorUserId } = context;
  await db.execute(sql`INSERT INTO equipment.customers (company_name) VALUES ('Rowley')`);
  const customer = await createCustomer({
    db,
    actorUserId,
    input: { name: 'Rowley', notes: 'Keep this', phone: '123' },
  });
  await expect(createCustomer({ db, actorUserId, input: { name: 'rowley' } })).rejects.toMatchObject({
    code: 'directory.duplicate',
  });
  await patchCustomer({ db, actorUserId, input: { id: customer.id, phone: null, email: 'rowley@example.com' } });
  expect(await getCustomer({ db, id: customer.id })).toMatchObject({
    name: 'Rowley',
    notes: 'Keep this',
    phone: null,
    email: 'rowley@example.com',
  });
  expect((await listCustomers({ db })).map((row) => row.id)).toEqual([customer.id]);
  const other = await createCustomer({ db, actorUserId, input: { name: 'Steyn' } });
  await expect(patchCustomer({ db, actorUserId, input: { id: other.id, name: 'ROWLEY' } })).rejects.toMatchObject({
    code: 'directory.duplicate',
  });
});

test('scopes Farm names and mutations to a Customer and deletes only unreferenced Farms', async ({ context }) => {
  const { db, actorUserId } = context;
  const { createFarm, listFarms, patchFarm, removeFarm } = await import('./farm-service.js');
  const first = await createCustomer({ db, actorUserId, input: { name: 'Rowley' } });
  const second = await createCustomer({ db, actorUserId, input: { name: 'Steyn' } });
  const farm = await createFarm({ db, actorUserId, input: { customerId: first.id, name: 'Rooikraal' } });
  const other = await createFarm({ db, actorUserId, input: { customerId: second.id, name: 'Rooikraal' } });
  await expect(
    createFarm({ db, actorUserId, input: { customerId: first.id, name: 'rooikraal' } }),
  ).rejects.toMatchObject({ code: 'directory.duplicate' });
  expect(await listFarms({ db, customerId: first.id })).toEqual([farm]);
  await expect(
    patchFarm({ db, actorUserId, input: { id: farm.id, customerId: second.id, name: 'Wrong customer' } }),
  ).rejects.toMatchObject({ code: 'directory.not_found' });
  await expect(removeFarm({ db, actorUserId, input: { id: farm.id, customerId: second.id } })).rejects.toMatchObject({
    code: 'directory.not_found',
  });
  // Jobs arrive in Wave 2; a real restrictive FK exercises the future reference guard.
  await db.execute(
    sql`CREATE TABLE contracting.farm_reference_test (farm_id uuid REFERENCES contracting.farm(id) ON DELETE RESTRICT)`,
  );
  await db.execute(sql`INSERT INTO contracting.farm_reference_test VALUES (${farm.id})`);
  await expect(removeFarm({ db, actorUserId, input: { id: farm.id, customerId: first.id } })).rejects.toMatchObject({
    code: 'directory.in_use',
  });
  await patchFarm({ db, actorUserId, input: { id: farm.id, customerId: first.id, name: 'Rooikraal East' } });
  expect((await listFarms({ db, customerId: first.id }))[0]?.name).toBe('Rooikraal East');
  await removeFarm({ db, actorUserId, input: { id: other.id, customerId: second.id } });
  expect(await listFarms({ db, customerId: second.id })).toEqual([]);
});

test('deactivates Work Types only for pickers, preserving referenced records and allowing reactivation', async ({
  context,
}) => {
  const { db, actorUserId } = context;
  const { createWorkType, getWorkType, listWorkTypes, patchWorkType, workTypeOptions } = await import(
    '../work-types/work-type-service.js'
  );
  const workType = await createWorkType({ db, actorUserId, input: { name: 'Dam building' } });
  expect(workType.active).toBe(true);
  await expect(createWorkType({ db, actorUserId, input: { name: 'DAM BUILDING' } })).rejects.toMatchObject({
    code: 'directory.duplicate',
  });
  await db.execute(
    sql`CREATE TABLE contracting.work_type_reference_test (work_type_id uuid REFERENCES contracting.work_type(id) ON DELETE RESTRICT)`,
  );
  await db.execute(sql`INSERT INTO contracting.work_type_reference_test VALUES (${workType.id})`);
  await patchWorkType({ db, actorUserId, input: { id: workType.id, active: false } });
  expect(await workTypeOptions({ db })).toEqual([]);
  expect(await getWorkType({ db, id: workType.id })).toMatchObject({ name: 'Dam building', active: false });
  expect(await listWorkTypes({ db })).toHaveLength(1);
  await patchWorkType({ db, actorUserId, input: { id: workType.id, name: 'Dams' } });
  expect((await getWorkType({ db, id: workType.id })).active).toBe(false);
  await patchWorkType({ db, actorUserId, input: { id: workType.id, active: true } });
  expect(await workTypeOptions({ db })).toMatchObject([{ id: workType.id, name: 'Dams' }]);
});
