import { auditEvents, user } from '@pkg/db';
import type { ContractingRole } from '@pkg/schema';
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
function contractingSession(role: ContractingRole) {
  const session = mockSession(null);
  session.user.contractingRole = role;
  return session;
}

test('requires Contracting fleet access even for Equipment administrators', async ({ context }) => {
  await expect(context.createAnonCaller().contractingFleet.machines.list({})).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
  for (const role of ['admin', 'super-admin'] as const) {
    const caller = context.createCaller(mockSession(role));
    if (role === 'admin')
      await expect(caller.contractingFleet.machines.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    else expect(await caller.contractingFleet.machines.list({})).toEqual([]);
  }
  const both = mockSession('sales');
  both.user.contractingRole = 'contracting-manager';
  expect(await context.createCaller(both).contractingFleet.machines.list({})).toEqual([]);
  await expect(
    context.createCaller(contractingSession('foreman')).contractingFleet.machines.list({}),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('gates rates separately on creates, patches, and every category response', async ({ context }) => {
  const admin = context.createCaller(contractingSession('contracting-admin')).contractingFleet;
  const manager = context.createCaller(contractingSession('contracting-manager')).contractingFleet;
  const workshop = context.createCaller(contractingSession('workshop-manager')).contractingFleet;
  const category = await admin.categories.create({ name: 'Tractors', presetRate: 750 });
  expect(category.presetRate).toBe(750);
  await expect(manager.categories.create({ name: 'Loaders', presetRate: 100 })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  const own = await manager.categories.create({ name: 'Loaders' });
  expect(own).not.toHaveProperty('presetRate');
  await expect(manager.categories.patch({ id: category.id, presetRate: 0 })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(await manager.categories.patch({ id: category.id, name: 'Hauler tractors' })).not.toHaveProperty('presetRate');
  expect(await workshop.categories.get({ id: category.id })).not.toHaveProperty('presetRate');
  expect((await manager.categories.list()).every((row) => !('presetRate' in row))).toBe(true);
  expect((await admin.categories.get({ id: category.id })).presetRate).toBe(750);
  await context
    .createCaller(mockSession('super-admin'))
    .contractingFleet.categories.patch({ id: category.id, presetRate: 800 });
  expect((await admin.categories.get({ id: category.id })).presetRate).toBe(800);
  await expect(workshop.categories.patch({ id: category.id, name: 'No' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('audits fleet writes atomically and keeps Contracting rates out of Equipment audit reads', async ({ context }) => {
  const fleet = context.createCaller(contractingSession('contracting-admin')).contractingFleet;
  const category = await fleet.categories.create({ name: 'Tractors', presetRate: 850 });
  const machine = await fleet.machines.create({
    code: 'jd6140m-1',
    make: 'Deere',
    model: '6140M',
    categoryId: category.id,
  });
  await fleet.machines.patch({ id: machine.id, notes: 'Service sticker captured' });
  await fleet.machines.patch({ id: machine.id, notes: 'Service sticker captured' });
  expect((await context.db.select().from(auditEvents)).map((row) => row.entityType)).toEqual([
    'contracting_category',
    'contracting_machine',
    'contracting_machine',
  ]);
  const equipment = context.createCaller(mockSession('admin'));
  expect((await equipment.audit.list({})).items).toEqual([]);
  expect((await equipment.audit.list({ filters: { entityTypes: ['contracting_category'] } })).items).toEqual([]);
  await expect(
    fleet.machines.create({ code: 'JD6140M-1', make: 'Deere', model: '6140M', categoryId: category.id }),
  ).rejects.toMatchObject({ appCode: 'fleet.duplicate', code: 'CONFLICT' });
});
