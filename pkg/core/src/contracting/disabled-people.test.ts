import { user } from '@pkg/db';
import { contractingMachineAssignments } from '@pkg/db/contracting';
import { accessForRole } from '@pkg/domain/testing';
import type { ContractingRole } from '@pkg/schema';
import { MachineCreateInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../test/create-tester.js';
import { createCustomer } from './customers/customer-service.js';
import { createFarm } from './customers/farm-service.js';
import { createCategory } from './fleet/category-service.js';
import { createMachine, machineOptions } from './fleet/machine-service.js';
import { createAssignment } from './jobs/assignment-service.js';
import { getJob, listDriverFilterOptions, listFieldDrivers, listForemen } from './jobs/job-read.js';
import { createJob, patchJob } from './jobs/job-service.js';
import { listMechanics } from './mechanics.js';
import { createWorkType } from './work-types/work-type-service.js';

const managerId = 'manager';
const manager = accessForRole('contracting-manager', managerId);

const test = createTester(async ({ db }) => {
  const now = new Date();
  const person = (id: string, contractingRole: ContractingRole) => ({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    contractingRole,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(user)
    .values([
      person(managerId, 'contracting-manager'),
      person('driver', 'driver'),
      person('disabled-driver', 'driver'),
      person('foreman', 'foreman'),
      person('disabled-foreman', 'foreman'),
      person('mechanic', 'mechanic'),
      person('disabled-mechanic', 'mechanic'),
    ]);
  const customer = await createCustomer({ db, actorUserId: managerId, input: { name: 'Rowley' } });
  const farm = await createFarm({ db, actorUserId: managerId, input: { customerId: customer.id, name: 'Rooikraal' } });
  const workType = await createWorkType({ db, actorUserId: managerId, input: { name: 'Dam building' } });
  const category = await createCategory({ db, actorUserId: managerId, input: { name: 'Tractors', kind: 'machine' } });
  const machine = await createMachine({
    db,
    actorUserId: managerId,
    input: MachineCreateInput.parse({ code: 'T-1', make: 'Deere', model: '6140M', categoryId: category.id }),
  });
  const jobInput = { customerId: customer.id, farmId: farm.id, workTypeId: workType.id, description: null };
  return { category, jobInput, machine };
});

const disable = (db: Parameters<typeof listForemen>[0]['db'], id: string) =>
  db.update(user).set({ banned: true }).where(eq(user.id, id));

test('Disabled people leave every Contracting picker but stay in the Jobs driver filter', async ({ context }) => {
  for (const id of ['disabled-driver', 'disabled-foreman', 'disabled-mechanic']) await disable(context.db, id);
  const names = (rows: { name: string }[]) => rows.map((row) => row.name);

  expect(names(await listFieldDrivers({ db: context.db }))).toEqual(['driver']);
  expect(names((await machineOptions({ db: context.db })).drivers)).toEqual(['driver']);
  expect(names(await listForemen({ db: context.db }))).toEqual(['foreman']);
  expect(names(await listMechanics({ db: context.db }))).toEqual(['mechanic']);
  expect(names(await listDriverFilterOptions({ db: context.db }))).toEqual(['disabled-driver', 'driver']);
});

test('a Disabled person cannot be named Foreman, Driver or default Driver, but a past Job naming one stays editable', async ({
  context,
}) => {
  const job = await createJob({
    db: context.db,
    actor: manager,
    input: { ...context.jobInput, foremanUserId: 'disabled-foreman' },
  });
  await createAssignment({
    db: context.db,
    actor: manager,
    input: { jobId: job.id, machineId: context.machine.id, implementId: null },
  });
  await context.db
    .update(contractingMachineAssignments)
    .set({ driverUserId: 'disabled-driver' })
    .where(eq(contractingMachineAssignments.jobId, job.id));
  await disable(context.db, 'disabled-foreman');
  await disable(context.db, 'disabled-driver');

  await expect(
    createJob({ db: context.db, actor: manager, input: { ...context.jobInput, foremanUserId: 'disabled-foreman' } }),
  ).rejects.toMatchObject({ code: 'contracting_job.invalid_foreman' });
  await expect(
    context.db
      .update(contractingMachineAssignments)
      .set({ implementId: null })
      .where(eq(contractingMachineAssignments.jobId, job.id)),
  ).resolves.toBeDefined();
  const other = await createJob({
    db: context.db,
    actor: manager,
    input: { ...context.jobInput, foremanUserId: null },
  });
  await createAssignment({
    db: context.db,
    actor: manager,
    input: { jobId: other.id, machineId: context.machine.id, implementId: null },
  });
  await expect(
    context.db
      .update(contractingMachineAssignments)
      .set({ driverUserId: 'disabled-driver' })
      .where(eq(contractingMachineAssignments.jobId, other.id)),
  ).rejects.toMatchObject({ cause: { message: 'Select a person with the Contracting driver role.' } });
  await expect(
    createMachine({
      db: context.db,
      actorUserId: managerId,
      input: MachineCreateInput.parse({
        code: 'T-2',
        make: 'Deere',
        model: '6140M',
        categoryId: context.category.id,
        currentDriverUserId: 'disabled-driver',
      }),
    }),
  ).rejects.toMatchObject({ code: 'fleet.invalid_driver' });

  await patchJob({ db: context.db, actor: manager, input: { id: job.id, description: 'Still editable' } });
  expect(await getJob({ db: context.db, id: job.id })).toMatchObject({
    description: 'Still editable',
    foremanUserId: 'disabled-foreman',
  });
});
