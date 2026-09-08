import { auditEvents, user } from '@pkg/db';
import type { ContractingRole } from '@pkg/schema';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Manager',
    email: 'manager@example.com',
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

test('restricts every directory operation to contracting managers, contracting admins and super-admins', async ({
  context,
}) => {
  const id = '00000000-0000-4000-8000-000000000000';
  const sessions = [
    mockSession('admin'),
    ...(['foreman', 'workshop-manager', 'contracting-invoicing', 'driver', 'mechanic'] as const).map(
      contractingSession,
    ),
  ];
  for (const session of sessions) {
    const directory = context.createCaller(session).contractingDirectory;
    for (const operation of [
      () => directory.customers.list(),
      () => directory.customers.get({ id }),
      () => directory.customers.create({ name: 'No' }),
      () => directory.customers.patch({ id, name: 'No' }),
      () => directory.farms.list({ customerId: id }),
      () => directory.farms.create({ customerId: id, name: 'No' }),
      () => directory.farms.patch({ id, customerId: id, name: 'No' }),
      () => directory.farms.remove({ id, customerId: id }),
      () => directory.workTypes.list(),
      () => directory.workTypes.options(),
      () => directory.workTypes.get({ id }),
      () => directory.workTypes.create({ name: 'No' }),
      () => directory.workTypes.patch({ id, active: false }),
    ])
      await expect(operation()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
  await expect(context.createAnonCaller().contractingDirectory.customers.list()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
  for (const session of [
    contractingSession('contracting-manager'),
    contractingSession('contracting-admin'),
    mockSession('super-admin'),
  ]) {
    const directory = context.createCaller(session).contractingDirectory;
    const customer = await directory.customers.create({ name: session.user.contractingRole ?? 'Super' });
    expect(await directory.customers.get({ id: customer.id })).toMatchObject({ name: customer.name });
    await directory.customers.patch({ id: customer.id, phone: '123' });
    const farm = await directory.farms.create({ customerId: customer.id, name: 'Rooikraal' });
    expect(await directory.farms.list({ customerId: customer.id })).toEqual([farm]);
    await directory.farms.patch({ id: farm.id, customerId: customer.id, name: 'East' });
    await directory.farms.remove({ id: farm.id, customerId: customer.id });
    const workType = await directory.workTypes.create({ name: customer.name });
    await directory.workTypes.patch({ id: workType.id, active: false });
    expect(await directory.workTypes.get({ id: workType.id })).toMatchObject({ active: false });
  }
});

test('normalizes inputs, returns public conflict errors and records business-attributed audits without no-op events', async ({
  context,
}) => {
  const directory = context.createCaller(contractingSession('contracting-manager')).contractingDirectory;
  const customer = await directory.customers.create({ name: '  Rowley  ', email: ' FARM@EXAMPLE.COM ' });
  expect(customer).toMatchObject({ name: 'Rowley', email: 'farm@example.com' });
  await expect(directory.customers.create({ name: 'rowley' })).rejects.toMatchObject({
    code: 'CONFLICT',
    appCode: 'directory.duplicate',
    message: 'A customer with that name already exists.',
  });
  await expect(directory.customers.patch({ id: customer.id, email: 'invalid' })).rejects.toMatchObject({
    code: 'BAD_REQUEST',
  });
  await expect(directory.farms.create({ customerId: customer.id, name: ' ' })).rejects.toMatchObject({
    code: 'BAD_REQUEST',
  });
  const farm = await directory.farms.create({ customerId: customer.id, name: 'Rooikraal' });
  await expect(directory.farms.create({ customerId: customer.id, name: 'ROOIKRAAL' })).rejects.toMatchObject({
    message: 'A farm with that name already exists for this customer.',
  });
  await directory.farms.remove({ id: farm.id, customerId: customer.id });
  const workType = await directory.workTypes.create({ name: 'Dam building' });
  await expect(directory.workTypes.create({ name: 'DAM BUILDING' })).rejects.toMatchObject({
    message: 'A work type with that name already exists.',
  });
  await directory.workTypes.patch({ id: workType.id, active: false });
  await directory.workTypes.patch({ id: workType.id, active: false });
  expect(await directory.workTypes.options()).toEqual([]);
  expect(await directory.workTypes.list()).toMatchObject([{ id: workType.id, active: false }]);
  expect((await context.db.select().from(auditEvents)).map((row) => [row.entityType, row.action])).toEqual([
    ['contracting_customer', 'created'],
    ['contracting_farm', 'created'],
    ['contracting_farm', 'deleted'],
    ['contracting_work_type', 'created'],
    ['contracting_work_type', 'updated'],
  ]);
  expect((await context.createCaller(mockSession('admin')).audit.list({})).items).toEqual([]);
});
