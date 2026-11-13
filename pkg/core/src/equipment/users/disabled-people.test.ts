import { user } from '@pkg/db';
import type { EquipmentRole } from '@pkg/schema';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { listFeedbackTargetUsers } from '../feedback/feedback-service.js';
import { getAssignableBayOperatorForUpdate, listBayOperators } from '../jobs/job-bay-service.js';
import { listQuoteSalespeople } from '../quotes/quote-read-service.js';

const test = createTester(async ({ db }) => {
  const now = new Date();
  const person = (id: string, role: EquipmentRole, banned: boolean) => ({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    role,
    banned,
    quoteSalesperson: role === 'sales',
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(user)
    .values([
      person('operator', 'bay-operator', false),
      person('disabled-operator', 'bay-operator', true),
      person('seller', 'sales', false),
      person('disabled-seller', 'sales', true),
    ]);
  return {};
});

test('Disabled people leave the Equipment pickers and cannot be assigned to a Bay', async ({ context }) => {
  expect((await listBayOperators({ db: context.db })).operators.map((operator) => operator.id)).toEqual(['operator']);
  expect((await listQuoteSalespeople({ db: context.db })).users.map((person) => person.id)).toEqual(['seller']);
  // The user admin still reads a Disabled User's salesperson flag.
  expect(
    (await listQuoteSalespeople({ db: context.db, includeDisabled: true })).users.map((person) => person.id),
  ).toEqual(['disabled-seller', 'seller']);
  expect((await listFeedbackTargetUsers({ db: context.db })).users.map((person) => person.id)).toEqual([
    'operator',
    'seller',
  ]);
  await expect(
    context.db.transaction((tx) => getAssignableBayOperatorForUpdate(tx, 'disabled-operator')),
  ).rejects.toMatchObject({ code: 'job.bay_operator_role_denied' });
});
