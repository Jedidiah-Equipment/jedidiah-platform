import { type Db, eq, getForeignKeyViolationConstraint, sql, user } from '@pkg/db';
import { contractingCategories, contractingMachines } from '@pkg/db/contracting';
import { ImplementCreateInput, MachineCreateInput, MachinePatchInput } from '@pkg/schema/contracting';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createCategory, getCategory, listCategories, patchCategory, removeCategory } from './category-service.js';
import {
  createImplement,
  getImplement,
  listImplements,
  patchImplement,
  removeImplement,
  retireImplement,
  suggestImplementCode,
} from './implement-service.js';
import {
  createMachine,
  getMachine,
  listMachines,
  machineOptions,
  patchMachine,
  removeMachine,
  retireMachine,
} from './machine-service.js';

const actorUserId = 'fleet-actor';
const test = createTester(async ({ db }) => {
  await insertUser(db, { id: actorUserId, name: 'Fleet admin', emailVerified: true });
  const category = await createCategory({ db, actorUserId, input: { name: 'Tractors', kind: 'machine' } });
  return { category, actorUserId };
});

function insertUser(
  db: Db,
  person: { id: string; name: string; emailVerified?: boolean; contractingRole?: 'driver'; isDevice?: boolean },
) {
  return db.insert(user).values({
    emailVerified: false,
    ...person,
    email: `${person.id}@example.com`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
const machineInput = (categoryId: string, fields: Partial<MachineCreateInput> = {}) =>
  MachineCreateInput.parse({ code: 'M1', make: 'Deere', model: '6140M', categoryId, ...fields });
// The triggers are the concurrency-safe guard behind each service check; a raw write proves they hold alone.
const rawWriteConstraint = (write: Promise<unknown>) =>
  write.then(
    () => null,
    (error) => getForeignKeyViolationConstraint(error),
  );
// Stand-in for later-wave history: exercise the actual restrictive FK, not a mocked history flag.
async function referenceFromHistory(db: Db, table: 'machine' | 'implement', id: string) {
  await db.execute(
    sql.raw(
      `CREATE TABLE contracting.${table}_history_test (ref uuid REFERENCES contracting.${table}(id) ON DELETE RESTRICT)`,
    ),
  );
  await db.execute(sql`INSERT INTO ${sql.raw(`contracting.${table}_history_test`)} VALUES (${id})`);
}

describe('machines', () => {
  test('stores uppercase codes', async ({ context: { db, category } }) => {
    const machine = await createMachine({ db, actorUserId, input: machineInput(category.id, { code: 'jd6140m-1' }) });
    expect(machine.code).toBe('JD6140M-1');
  });

  test('rejects a case-insensitive duplicate code', async ({ context: { db, category } }) => {
    await createMachine({ db, actorUserId, input: machineInput(category.id, { code: 'jd6140m-1' }) });
    await expect(
      createMachine({ db, actorUserId, input: machineInput(category.id, { code: 'JD6140M-1' }) }),
    ).rejects.toMatchObject({ code: 'fleet.duplicate' });
  });

  test('searches codes case-insensitively within a category', async ({ context: { db, category } }) => {
    const machine = await createMachine({ db, actorUserId, input: machineInput(category.id, { code: 'JD6140M-1' }) });
    const found = await listMachines({ db, input: { search: 'jd6140', categoryId: category.id, status: 'active' } });
    expect(found.map((row) => row.id)).toEqual([machine.id]);
  });

  test('refuses to delete a machine with history', async ({ context: { db, category } }) => {
    const machine = await createMachine({ db, actorUserId, input: machineInput(category.id) });
    await referenceFromHistory(db, 'machine', machine.id);
    await expect(removeMachine({ db, actorUserId, id: machine.id })).rejects.toMatchObject({ code: 'fleet.in_use' });
  });

  test('retires with a reason, keeps its fields, and leaves the active list', async ({ context: { db, category } }) => {
    const machine = await createMachine({
      db,
      actorUserId,
      input: machineInput(category.id, { notes: 'Keep history' }),
    });
    await expect(retireMachine({ db, actorUserId, input: { id: machine.id, reason: ' ' } })).rejects.toThrow();
    await retireMachine({ db, actorUserId, input: { id: machine.id, reason: 'Sold' } });
    expect(await listMachines({ db, input: { search: '', status: 'active' } })).toEqual([]);
    expect(await getMachine({ db, id: machine.id })).toMatchObject({ retiredReason: 'Sold', notes: 'Keep history' });
  });

  test('a retired machine can be neither changed nor deleted', async ({ context: { db, category } }) => {
    const machine = await createMachine({ db, actorUserId, input: machineInput(category.id) });
    await retireMachine({ db, actorUserId, input: { id: machine.id, reason: 'Sold' } });
    await expect(patchMachine({ db, actorUserId, input: { id: machine.id, notes: 'Edit' } })).rejects.toMatchObject({
      code: 'fleet.retired',
    });
    await expect(removeMachine({ db, actorUserId, id: machine.id })).rejects.toMatchObject({ code: 'fleet.retired' });
  });

  test('patches preserve omitted fields', async ({ context: { db, category } }) => {
    const machine = await createMachine({
      db,
      actorUserId,
      input: machineInput(category.id, { notes: 'Keep', year: 2020 }),
    });
    const patched = await patchMachine({
      db,
      actorUserId,
      input: MachinePatchInput.parse({ id: machine.id, registration: 'CA123' }),
    });
    expect(patched).toMatchObject({ notes: 'Keep', year: 2020, registration: 'CA123' });
  });

  test('deletes a machine without history', async ({ context: { db, category } }) => {
    const machine = await createMachine({ db, actorUserId, input: machineInput(category.id) });
    await removeMachine({ db, actorUserId, id: machine.id });
    await expect(getMachine({ db, id: machine.id })).rejects.toMatchObject({ code: 'fleet.not_found' });
  });
});

describe('drivers', () => {
  test('accepts only a person with the Contracting driver role', async ({ context: { db, category } }) => {
    await insertUser(db, { id: 'driver', name: 'Driver', contractingRole: 'driver' });
    await insertUser(db, { id: 'device', name: 'Tablet', contractingRole: 'driver', isDevice: true });
    for (const currentDriverUserId of [actorUserId, 'device'])
      await expect(
        createMachine({ db, actorUserId, input: machineInput(category.id, { currentDriverUserId }) }),
      ).rejects.toMatchObject({ code: 'fleet.invalid_driver' });
    const machine = await createMachine({
      db,
      actorUserId,
      input: machineInput(category.id, { currentDriverUserId: 'driver' }),
    });
    expect(machine.currentDriverUserId).toBe('driver');
    expect(await machineOptions({ db })).toMatchObject({
      makes: ['Deere'],
      models: ['6140M'],
      drivers: [{ id: 'driver' }],
    });
  });

  test('the trigger refuses a device account as driver', async ({ context: { db, category } }) => {
    await insertUser(db, { id: 'device', name: 'Tablet', contractingRole: 'driver', isDevice: true });
    const write = db.insert(contractingMachines).values(machineInput(category.id, { currentDriverUserId: 'device' }));
    expect(await rawWriteConstraint(write)).toBe('machine_driver_role');
  });

  test('an assigned driver keeps the role and stays a person until unassigned', async ({
    context: { db, category },
  }) => {
    await insertUser(db, { id: 'role-driver', name: 'Driver', contractingRole: 'driver' });
    const machine = await createMachine({
      db,
      actorUserId,
      input: machineInput(category.id, { currentDriverUserId: 'role-driver' }),
    });
    for (const change of [{ contractingRole: 'foreman' as const }, { isDevice: true }])
      expect(await rawWriteConstraint(db.update(user).set(change).where(eq(user.id, 'role-driver')))).toBe(
        'machine_driver_role',
      );
    await patchMachine({ db, actorUserId, input: { id: machine.id, currentDriverUserId: null } });
    await db.update(user).set({ contractingRole: 'foreman' }).where(eq(user.id, 'role-driver'));
    await expect(
      patchMachine({ db, actorUserId, input: { id: machine.id, currentDriverUserId: 'role-driver' } }),
    ).rejects.toMatchObject({ code: 'fleet.invalid_driver' });
  });
});

describe('categories', () => {
  test('default icon and colour by kind', async ({ context: { db, category } }) => {
    expect(category).toMatchObject({ kind: 'machine', icon: 'generic-machine', colour: 'gray' });
    const towed = await createCategory({ db, actorUserId, input: { name: 'Tractors', kind: 'implement' } });
    expect(towed).toMatchObject({ icon: 'generic-implement', colour: 'gray' });
  });

  test('names are unique per kind, case-insensitively', async ({ context: { db } }) => {
    await expect(
      createCategory({ db, actorUserId, input: { name: 'tractors', kind: 'machine' } }),
    ).rejects.toMatchObject({ code: 'fleet.duplicate' });
    const towed = await createCategory({ db, actorUserId, input: { name: 'Tractors', kind: 'implement' } });
    expect((await listCategories({ db, input: { kind: 'implement' } })).map((row) => row.id)).toEqual([towed.id]);
  });

  test('patches preserve omitted fields', async ({ context: { db, category } }) => {
    await patchCategory({ db, actorUserId, input: { id: category.id, icon: 'tractor', colour: 'green' } });
    await patchCategory({ db, actorUserId, input: { id: category.id, name: 'Hauler tractors' } });
    expect(await getCategory({ db, id: category.id })).toMatchObject({
      name: 'Hauler tractors',
      icon: 'tractor',
      colour: 'green',
    });
  });

  test('a referenced category is in use and cannot be deleted', async ({ context: { db, category } }) => {
    expect((await getCategory({ db, id: category.id })).inUse).toBe(false);
    await createMachine({ db, actorUserId, input: machineInput(category.id) });
    expect((await getCategory({ db, id: category.id })).inUse).toBe(true);
    await expect(removeCategory({ db, actorUserId, id: category.id })).rejects.toMatchObject({ code: 'fleet.in_use' });
  });
});

describe('category kind', () => {
  test('a machine takes only a machine category and an implement only an implement one', async ({
    context: { db, category },
  }) => {
    const trailers = await createCategory({ db, actorUserId, input: { name: 'Gravel trailer', kind: 'implement' } });
    await expect(createMachine({ db, actorUserId, input: machineInput(trailers.id) })).rejects.toMatchObject({
      code: 'fleet.invalid_category',
      message: 'Select a Machine category.',
    });
    await expect(
      createImplement({ db, actorUserId, input: ImplementCreateInput.parse({ code: 'X-1', categoryId: category.id }) }),
    ).rejects.toMatchObject({ code: 'fleet.invalid_category', message: 'Select an Implement category.' });
    const machine = await createMachine({ db, actorUserId, input: machineInput(category.id) });
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
    const write = db
      .update(contractingMachines)
      .set({ categoryId: trailers.id })
      .where(eq(contractingMachines.id, machine.id));
    expect(await rawWriteConstraint(write)).toBe('machine_category_kind');
  });

  test('a referenced kind is locked; an unused one can change', async ({ context: { db } }) => {
    const trailers = await createCategory({ db, actorUserId, input: { name: 'Gravel trailer', kind: 'implement' } });
    await createImplement({
      db,
      actorUserId,
      input: ImplementCreateInput.parse({ code: 'GRAVEL-TRAILER-1', categoryId: trailers.id }),
    });
    await expect(patchCategory({ db, actorUserId, input: { id: trailers.id, kind: 'machine' } })).rejects.toMatchObject(
      {
        code: 'fleet.kind_in_use',
      },
    );
    const write = db
      .update(contractingCategories)
      .set({ kind: 'machine' })
      .where(eq(contractingCategories.id, trailers.id));
    expect(await rawWriteConstraint(write)).toBe('category_kind_in_use');
    const spare = await createCategory({ db, actorUserId, input: { name: 'Spare', kind: 'implement' } });
    expect((await patchCategory({ db, actorUserId, input: { id: spare.id, kind: 'machine' } })).kind).toBe('machine');
  });
});

describe('implements', () => {
  const discInput = (categoryId: string) => ImplementCreateInput.parse({ code: 'disc-1', categoryId, notes: 'Keep' });

  test('normalize codes, reject duplicates, and patch notes', async ({ context: { db } }) => {
    const discs = await createCategory({ db, actorUserId, input: { name: 'Disc', kind: 'implement' } });
    const implement = await createImplement({ db, actorUserId, input: discInput(discs.id) });
    expect(implement.code).toBe('DISC-1');
    await expect(createImplement({ db, actorUserId, input: discInput(discs.id) })).rejects.toMatchObject({
      code: 'fleet.duplicate',
    });
    await patchImplement({ db, actorUserId, input: { id: implement.id, notes: 'Offset' } });
    expect(await getImplement({ db, id: implement.id })).toMatchObject({ notes: 'Offset', categoryName: 'Disc' });
  });

  test('keep referenced history on retirement', async ({ context: { db } }) => {
    const discs = await createCategory({ db, actorUserId, input: { name: 'Disc', kind: 'implement' } });
    const implement = await createImplement({ db, actorUserId, input: discInput(discs.id) });
    await referenceFromHistory(db, 'implement', implement.id);
    await expect(removeImplement({ db, actorUserId, id: implement.id })).rejects.toMatchObject({
      code: 'fleet.in_use',
    });
    await retireImplement({ db, actorUserId, input: { id: implement.id, reason: 'Sold' } });
    expect(await listImplements({ db, input: { search: '', status: 'active' } })).toEqual([]);
    expect(await getImplement({ db, id: implement.id })).toMatchObject({ retiredReason: 'Sold', notes: 'Keep' });
    await expect(removeImplement({ db, actorUserId, id: implement.id })).rejects.toMatchObject({
      code: 'fleet.retired',
    });
  });
});

describe('suggested implement codes', () => {
  const create = (db: Db, code: string, categoryId: string) =>
    createImplement({ db, actorUserId, input: ImplementCreateInput.parse({ code, categoryId }) });

  test('continue past the highest number, retired included', async ({ context: { db } }) => {
    const trailers = await createCategory({
      db,
      actorUserId,
      input: { name: 'Gravel trailer (6t)', kind: 'implement' },
    });
    expect(await suggestImplementCode({ db, categoryId: trailers.id })).toEqual({ code: 'GRAVEL-TRAILER-6T-1' });
    const first = await create(db, 'gravel-trailer-6t-1', trailers.id);
    await create(db, 'GRAVEL-TRAILER-6T-7', trailers.id);
    await retireImplement({ db, actorUserId, input: { id: first.id, reason: 'Scrapped' } });
    expect(await suggestImplementCode({ db, categoryId: trailers.id })).toEqual({ code: 'GRAVEL-TRAILER-6T-8' });
    await expect(create(db, 'GRAVEL-TRAILER-6T-7', trailers.id)).rejects.toMatchObject({ code: 'fleet.duplicate' });
  });

  test('follow a category rename without rewriting existing codes', async ({ context: { db } }) => {
    const trailers = await createCategory({
      db,
      actorUserId,
      input: { name: 'Gravel trailer (6t)', kind: 'implement' },
    });
    const first = await create(db, 'GRAVEL-TRAILER-6T-1', trailers.id);
    await patchCategory({ db, actorUserId, input: { id: trailers.id, name: 'Tip trailer' } });
    expect((await getImplement({ db, id: first.id })).code).toBe('GRAVEL-TRAILER-6T-1');
    expect(await suggestImplementCode({ db, categoryId: trailers.id })).toEqual({ code: 'TIP-TRAILER-1' });
  });

  test('are refused for a machine category', async ({ context: { db, category } }) => {
    await expect(suggestImplementCode({ db, categoryId: category.id })).rejects.toMatchObject({
      code: 'fleet.invalid_category',
    });
  });
});
