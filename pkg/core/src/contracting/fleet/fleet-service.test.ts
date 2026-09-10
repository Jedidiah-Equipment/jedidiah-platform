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
  const category = await createCategory({ db, actorUserId, input: { name: 'Tractors', kind: 'machine' } });
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

test('accepts only people with the Contracting driver role, preserves omitted fields, and deletes unused machines', async ({
  context,
}) => {
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
  await db.insert(user).values({
    id: 'device',
    name: 'Tablet',
    email: 'tablet@example.com',
    emailVerified: false,
    contractingRole: 'driver',
    isDevice: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await expect(
    createMachine({ db, actorUserId, input: { ...input, currentDriverUserId: 'device' } }),
  ).rejects.toMatchObject({ code: 'fleet.invalid_driver' });
  const { contractingMachines } = await import('@pkg/db/contracting');
  const { getForeignKeyViolationConstraint } = await import('@pkg/db');
  const deviceAssignmentError = await db
    .insert(contractingMachines)
    .values({ ...input, currentDriverUserId: 'device' })
    .then(
      () => null,
      (error) => error,
    );
  expect(getForeignKeyViolationConstraint(deviceAssignmentError)).toBe('machine_driver_role');
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

test('categories default icon and colour by kind, are unique per kind, and patches preserve omitted fields', async ({
  context,
}) => {
  const { db, actorUserId, category } = context;
  const { getCategory, patchCategory, removeCategory, listCategories } = await import('./category-service.js');
  expect(category).toMatchObject({ kind: 'machine', icon: 'generic-machine', colour: 'gray' });
  await expect(createCategory({ db, actorUserId, input: { name: 'tractors', kind: 'machine' } })).rejects.toMatchObject(
    {
      code: 'fleet.duplicate',
    },
  );
  const towed = await createCategory({ db, actorUserId, input: { name: 'Tractors', kind: 'implement' } });
  expect(towed).toMatchObject({ icon: 'generic-implement', colour: 'gray' });
  await patchCategory({ db, actorUserId, input: { id: category.id, icon: 'tractor', colour: 'green' } });
  await patchCategory({ db, actorUserId, input: { id: category.id, name: 'Hauler tractors' } });
  expect(await getCategory({ db, id: category.id })).toMatchObject({
    name: 'Hauler tractors',
    icon: 'tractor',
    colour: 'green',
  });
  expect((await listCategories({ db, input: { kind: 'implement' } })).map((row) => row.id)).toEqual([towed.id]);
  expect((await getCategory({ db, id: category.id })).inUse).toBe(false);
  await createMachine({
    db,
    actorUserId,
    input: MachineCreateInput.parse({ code: 'M3', make: 'Deere', model: '6140M', categoryId: category.id }),
  });
  expect((await getCategory({ db, id: category.id })).inUse).toBe(true);
  await expect(removeCategory({ db, actorUserId, id: category.id })).rejects.toMatchObject({ code: 'fleet.in_use' });
});

test('a machine cannot take an implement category and vice versa, and a referenced kind is locked', async ({
  context,
}) => {
  const { db, actorUserId, category } = context;
  const { eq, getForeignKeyViolationConstraint } = await import('@pkg/db');
  const { contractingCategories, contractingMachines } = await import('@pkg/db/contracting');
  const { ImplementCreateInput } = await import('@pkg/schema/contracting');
  const { patchCategory } = await import('./category-service.js');
  const { createImplement, patchImplement } = await import('./implement-service.js');
  const { patchMachine } = await import('./machine-service.js');
  const trailers = await createCategory({ db, actorUserId, input: { name: 'Gravel trailer', kind: 'implement' } });
  const machineInput = MachineCreateInput.parse({ code: 'M4', make: 'Deere', model: '6140M', categoryId: trailers.id });
  await expect(createMachine({ db, actorUserId, input: machineInput })).rejects.toMatchObject({
    code: 'fleet.invalid_category',
    message: 'Select a Machine category.',
  });
  await expect(
    createImplement({ db, actorUserId, input: ImplementCreateInput.parse({ code: 'X-1', categoryId: category.id }) }),
  ).rejects.toMatchObject({ code: 'fleet.invalid_category', message: 'Select an Implement category.' });
  const machine = await createMachine({ db, actorUserId, input: { ...machineInput, categoryId: category.id } });
  const implement = await createImplement({
    db,
    actorUserId,
    input: ImplementCreateInput.parse({ code: 'GRAVEL-TRAILER-1', categoryId: trailers.id }),
  });
  expect(implement).toMatchObject({ categoryName: 'Gravel trailer', categoryIcon: 'generic-implement' });
  await expect(
    patchMachine({ db, actorUserId, input: { id: machine.id, categoryId: trailers.id } }),
  ).rejects.toMatchObject({ code: 'fleet.invalid_category' });
  await expect(
    patchImplement({ db, actorUserId, input: { id: implement.id, categoryId: category.id } }),
  ).rejects.toMatchObject({ code: 'fleet.invalid_category' });
  // The trigger is the concurrency-safe guard behind the service check.
  const rawError = await db
    .update(contractingMachines)
    .set({ categoryId: trailers.id })
    .where(eq(contractingMachines.id, machine.id))
    .then(
      () => null,
      (error) => error,
    );
  expect(getForeignKeyViolationConstraint(rawError)).toBe('machine_category_kind');
  await expect(patchCategory({ db, actorUserId, input: { id: trailers.id, kind: 'machine' } })).rejects.toMatchObject({
    code: 'fleet.kind_in_use',
  });
  const rawKindError = await db
    .update(contractingCategories)
    .set({ kind: 'machine' })
    .where(eq(contractingCategories.id, trailers.id))
    .then(
      () => null,
      (error) => error,
    );
  expect(getForeignKeyViolationConstraint(rawKindError)).toBe('category_kind_in_use');
  const spare = await createCategory({ db, actorUserId, input: { name: 'Spare', kind: 'implement' } });
  expect((await patchCategory({ db, actorUserId, input: { id: spare.id, kind: 'machine' } })).kind).toBe('machine');
});

test('suggests the next implement code from the category name, past retired numbers, never rewriting codes', async ({
  context,
}) => {
  const { db, actorUserId } = context;
  const { ImplementCreateInput } = await import('@pkg/schema/contracting');
  const { patchCategory } = await import('./category-service.js');
  const { createImplement, getImplement, retireImplement, suggestImplementCode } = await import(
    './implement-service.js'
  );
  const trailers = await createCategory({ db, actorUserId, input: { name: 'Gravel trailer (6t)', kind: 'implement' } });
  expect(await suggestImplementCode({ db, categoryId: trailers.id })).toEqual({ code: 'GRAVEL-TRAILER-6T-1' });
  const first = await createImplement({
    db,
    actorUserId,
    input: ImplementCreateInput.parse({ code: 'gravel-trailer-6t-1', categoryId: trailers.id }),
  });
  await createImplement({
    db,
    actorUserId,
    input: ImplementCreateInput.parse({ code: 'GRAVEL-TRAILER-6T-7', categoryId: trailers.id }),
  });
  await retireImplement({ db, actorUserId, input: { id: first.id, reason: 'Scrapped' } });
  expect(await suggestImplementCode({ db, categoryId: trailers.id })).toEqual({ code: 'GRAVEL-TRAILER-6T-8' });
  await expect(
    createImplement({
      db,
      actorUserId,
      input: ImplementCreateInput.parse({ code: 'GRAVEL-TRAILER-6T-7', categoryId: trailers.id }),
    }),
  ).rejects.toMatchObject({ code: 'fleet.duplicate' });
  await patchCategory({ db, actorUserId, input: { id: trailers.id, name: 'Tip trailer' } });
  expect((await getImplement({ db, id: first.id })).code).toBe('GRAVEL-TRAILER-6T-1');
  expect(await suggestImplementCode({ db, categoryId: trailers.id })).toEqual({ code: 'TIP-TRAILER-1' });
  const machines = await createCategory({ db, actorUserId, input: { name: 'Loaders', kind: 'machine' } });
  await expect(suggestImplementCode({ db, categoryId: machines.id })).rejects.toMatchObject({
    code: 'fleet.invalid_category',
  });
});

test('implements normalize codes, reject duplicates and preserve referenced history on retirement', async ({
  context,
}) => {
  const { db, actorUserId } = context;
  const { sql } = await import('@pkg/db');
  const { ImplementCreateInput } = await import('@pkg/schema/contracting');
  const { createImplement, patchImplement, getImplement, removeImplement, retireImplement, listImplements } =
    await import('./implement-service.js');
  const discs = await createCategory({ db, actorUserId, input: { name: 'Disc', kind: 'implement' } });
  const input = ImplementCreateInput.parse({ code: 'disc-1', categoryId: discs.id, notes: 'Keep' });
  const implement = await createImplement({ db, actorUserId, input });
  expect(implement.code).toBe('DISC-1');
  await expect(createImplement({ db, actorUserId, input })).rejects.toMatchObject({ code: 'fleet.duplicate' });
  await patchImplement({ db, actorUserId, input: { id: implement.id, notes: 'Offset' } });
  expect(await getImplement({ db, id: implement.id })).toMatchObject({ notes: 'Offset', categoryName: 'Disc' });
  await db.execute(
    sql`CREATE TABLE contracting.implement_history_test (implement_id uuid REFERENCES contracting.implement(id) ON DELETE RESTRICT)`,
  );
  await db.execute(sql`INSERT INTO contracting.implement_history_test VALUES (${implement.id})`);
  await expect(removeImplement({ db, actorUserId, id: implement.id })).rejects.toMatchObject({ code: 'fleet.in_use' });
  await retireImplement({ db, actorUserId, input: { id: implement.id, reason: 'Sold' } });
  expect(await listImplements({ db, input: { search: '', status: 'active' } })).toEqual([]);
  expect(await getImplement({ db, id: implement.id })).toMatchObject({ retiredReason: 'Sold', notes: 'Offset' });
  await expect(removeImplement({ db, actorUserId, id: implement.id })).rejects.toMatchObject({ code: 'fleet.retired' });
});

test('keeps assigned drivers eligible across role and device changes until unassigned', async ({ context }) => {
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
  for (const change of [{ contractingRole: 'foreman' as const }, { isDevice: true }]) {
    const error = await db
      .update(user)
      .set(change)
      .where(eq(user.id, 'role-driver'))
      .then(
        () => null,
        (error) => error,
      );
    expect(getForeignKeyViolationConstraint(error)).toBe('machine_driver_role');
  }
  await patchMachine({ db, actorUserId, input: { id: machine.id, currentDriverUserId: null } });
  await db.update(user).set({ contractingRole: 'foreman' }).where(eq(user.id, 'role-driver'));
  await expect(
    patchMachine({ db, actorUserId, input: { id: machine.id, currentDriverUserId: 'role-driver' } }),
  ).rejects.toMatchObject({ code: 'fleet.invalid_driver' });
});
