import { user } from '@pkg/db';
import { MachineCreateInput } from '@pkg/schema/contracting';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCategory } from './category-service.js';
import { createMachine, listMachines } from './machine-service.js';

const actorUserId = 'fleet-actor';
const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: actorUserId,
    name: 'Fleet admin',
    email: 'fleet@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const category = await createCategory({ db, actorUserId, input: { name: 'Tractors' } });
  return { category, actorUserId };
});

test('stores uppercase machine codes and rejects case-insensitive duplicates', async ({ context }) => {
  const { db, category, actorUserId } = context;
  const input = MachineCreateInput.parse({
    code: 'jd6140m-1',
    make: 'John Deere',
    model: '6140M',
    categoryId: category.id,
  });
  const machine = await createMachine({ db, actorUserId, input });
  expect(machine.code).toBe('JD6140M-1');
  await expect(createMachine({ db, actorUserId, input: { ...input, code: 'JD6140M-1' } })).rejects.toMatchObject({
    code: 'fleet.duplicate',
  });
  expect(
    (await listMachines({ db, input: { search: 'jd6140', categoryId: category.id, status: 'active' } })).map(
      (row) => row.id,
    ),
  ).toEqual([machine.id]);
});

test('rejects deletion of referenced machines, retires with a reason and excludes them from pickers', async ({
  context,
}) => {
  const { db, category, actorUserId } = context;
  const { sql } = await import('@pkg/db');
  const { getMachine, retireMachine, removeMachine, patchMachine } = await import('./machine-service.js');
  const machine = await createMachine({
    db,
    actorUserId,
    input: MachineCreateInput.parse({
      code: 'M1',
      make: 'Deere',
      model: '6140M',
      categoryId: category.id,
      notes: 'Keep history',
    }),
  });
  // Stand-in for later-wave history: exercise the actual restrictive FK, not a mocked history flag.
  await db.execute(
    sql`CREATE TABLE contracting.fleet_history_test (machine_id uuid REFERENCES contracting.machine(id) ON DELETE RESTRICT)`,
  );
  await db.execute(sql`INSERT INTO contracting.fleet_history_test VALUES (${machine.id})`);
  await expect(removeMachine({ db, actorUserId, id: machine.id })).rejects.toMatchObject({ code: 'fleet.in_use' });
  await expect(retireMachine({ db, actorUserId, input: { id: machine.id, reason: ' ' } })).rejects.toThrow();
  await retireMachine({ db, actorUserId, input: { id: machine.id, reason: 'Sold' } });
  expect(await listMachines({ db, input: { search: '', status: 'active' } })).toEqual([]);
  expect(await getMachine({ db, id: machine.id })).toMatchObject({ retiredReason: 'Sold', notes: 'Keep history' });
  await expect(patchMachine({ db, actorUserId, input: { id: machine.id, notes: 'Edit' } })).rejects.toMatchObject({
    code: 'fleet.retired',
  });
  await expect(removeMachine({ db, actorUserId, id: machine.id })).rejects.toMatchObject({ code: 'fleet.retired' });
});

test('accepts only Contracting drivers, preserves omitted fields, and deletes unused machines', async ({ context }) => {
  const { db, category, actorUserId } = context;
  const { MachinePatchInput } = await import('@pkg/schema/contracting');
  const { getMachine, patchMachine, removeMachine, machineOptions } = await import('./machine-service.js');
  const input = MachineCreateInput.parse({
    code: 'M2',
    make: 'Deere',
    model: '6140M',
    categoryId: category.id,
    currentDriverUserId: actorUserId,
    notes: 'Keep',
    year: 2020,
  });
  await expect(createMachine({ db, actorUserId, input })).rejects.toMatchObject({ code: 'fleet.invalid_driver' });
  await db.insert(user).values({
    id: 'driver',
    name: 'Driver',
    email: 'driver@example.com',
    emailVerified: false,
    contractingRole: 'driver',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const machine = await createMachine({ db, actorUserId, input: { ...input, currentDriverUserId: 'driver' } });
  const patched = await patchMachine({
    db,
    actorUserId,
    input: MachinePatchInput.parse({ id: machine.id, registration: 'CA123' }),
  });
  expect(patched).toMatchObject({ notes: 'Keep', year: 2020, currentDriverUserId: 'driver', registration: 'CA123' });
  expect(await machineOptions({ db })).toMatchObject({
    makes: ['Deere'],
    models: ['6140M'],
    drivers: [{ id: 'driver' }],
  });
  await patchMachine({ db, actorUserId, input: { id: machine.id, currentDriverUserId: null } });
  expect((await getMachine({ db, id: machine.id })).currentDriverUserId).toBeNull();
  await removeMachine({ db, actorUserId, id: machine.id });
  await expect(getMachine({ db, id: machine.id })).rejects.toMatchObject({ code: 'fleet.not_found' });
});

test('categories reject duplicate names and linked deletion; name patches preserve the preset rate', async ({
  context,
}) => {
  const { db, actorUserId, category } = context;
  const { getCategory, patchCategory, removeCategory } = await import('./category-service.js');
  await expect(createCategory({ db, actorUserId, input: { name: 'tractors' } })).rejects.toMatchObject({
    code: 'fleet.duplicate',
  });
  await patchCategory({ db, actorUserId, input: { id: category.id, presetRate: 725.5 } });
  await patchCategory({ db, actorUserId, input: { id: category.id, name: 'Hauler tractors' } });
  expect(await getCategory({ db, id: category.id })).toMatchObject({ name: 'Hauler tractors', presetRate: 725.5 });
  await createMachine({
    db,
    actorUserId,
    input: MachineCreateInput.parse({ code: 'M3', make: 'Deere', model: '6140M', categoryId: category.id }),
  });
  await expect(removeCategory({ db, actorUserId, id: category.id })).rejects.toMatchObject({ code: 'fleet.in_use' });
});

test('implements normalize codes, reject duplicates and preserve referenced history on retirement', async ({
  context,
}) => {
  const { db, actorUserId } = context;
  const { sql } = await import('@pkg/db');
  const { ImplementCreateInput } = await import('@pkg/schema/contracting');
  const {
    createImplement,
    patchImplement,
    getImplement,
    removeImplement,
    retireImplement,
    listImplements,
    implementTypes,
  } = await import('./implement-service.js');
  const input = ImplementCreateInput.parse({ code: 'disc-1', implementType: 'Disc', notes: 'Keep' });
  const implement = await createImplement({ db, actorUserId, input });
  expect(implement.code).toBe('DISC-1');
  await expect(createImplement({ db, actorUserId, input })).rejects.toMatchObject({ code: 'fleet.duplicate' });
  await patchImplement({ db, actorUserId, input: { id: implement.id, implementType: 'Offset disc' } });
  expect(await implementTypes({ db })).toEqual(['Offset disc']);
  await db.execute(
    sql`CREATE TABLE contracting.implement_history_test (implement_id uuid REFERENCES contracting.implement(id) ON DELETE RESTRICT)`,
  );
  await db.execute(sql`INSERT INTO contracting.implement_history_test VALUES (${implement.id})`);
  await expect(removeImplement({ db, actorUserId, id: implement.id })).rejects.toMatchObject({ code: 'fleet.in_use' });
  await retireImplement({ db, actorUserId, input: { id: implement.id, reason: 'Sold' } });
  expect(await listImplements({ db, input: { search: '', status: 'active' } })).toEqual([]);
  expect(await getImplement({ db, id: implement.id })).toMatchObject({ retiredReason: 'Sold', notes: 'Keep' });
  await expect(removeImplement({ db, actorUserId, id: implement.id })).rejects.toMatchObject({ code: 'fleet.retired' });
});

test('keeps assigned drivers eligible across user role changes until unassigned', async ({ context }) => {
  const { db, category, actorUserId } = context;
  const { eq, getForeignKeyViolationConstraint } = await import('@pkg/db');
  const { patchMachine } = await import('./machine-service.js');
  await db.insert(user).values({
    id: 'role-driver',
    name: 'Driver',
    email: 'role-driver@example.com',
    emailVerified: false,
    contractingRole: 'driver',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const machine = await createMachine({
    db,
    actorUserId,
    input: MachineCreateInput.parse({
      code: 'ROLE-1',
      make: 'Deere',
      model: '6140M',
      categoryId: category.id,
      currentDriverUserId: 'role-driver',
    }),
  });
  const error = await db
    .update(user)
    .set({ contractingRole: 'foreman' })
    .where(eq(user.id, 'role-driver'))
    .then(
      () => null,
      (error) => error,
    );
  expect(getForeignKeyViolationConstraint(error)).toBe('machine_driver_role');
  await patchMachine({ db, actorUserId, input: { id: machine.id, currentDriverUserId: null } });
  await db.update(user).set({ contractingRole: 'foreman' }).where(eq(user.id, 'role-driver'));
  await expect(
    patchMachine({ db, actorUserId, input: { id: machine.id, currentDriverUserId: 'role-driver' } }),
  ).rejects.toMatchObject({ code: 'fleet.invalid_driver' });
});
