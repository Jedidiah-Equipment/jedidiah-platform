import { auditEvents, user } from '@pkg/db';
import { describe, expect } from 'vitest';
import { createTester } from '../test/create-tester.js';
import { getUserRemovalVerdict, isRemovalHistory, listUserForeignKeys } from './user-removal.js';

const test = createTester(async ({ db }) => {
  const now = new Date();
  await db.insert(user).values(
    ['fresh', 'veteran'].map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })),
  );
  return {};
});

describe('User Removal', () => {
  // A new cascading key must be reviewed before it lands here: does that row belong to the account (add it to
  // ACCOUNT_OWNED_TABLES so Remove deletes it), or is it history that should refuse the removal (the default)?
  test('pins every cascading key to user', async ({ context }) => {
    const cascading = (await listUserForeignKeys(context.db)).filter((key) => key.cascades);

    expect(cascading.map((key) => `${key.schema}.${key.table}.${key.column}`)).toEqual([
      'equipment.feedback_user.user_id',
      'equipment.user_department.user_id',
      'public.account.user_id',
      'public.changelog_view.user_id',
      'public.push_token.user_id',
      'public.session.user_id',
    ]);
  });

  test('only the account’s own cascading rows go with it; a Corrective Feedback target is history', async ({
    context,
  }) => {
    const history = (await listUserForeignKeys(context.db))
      .filter((key) => key.cascades && isRemovalHistory(key))
      .map((key) => `${key.schema}.${key.table}.${key.column}`);

    expect(history).toEqual(['equipment.feedback_user.user_id']);
  });

  test('anything a non-cascading key names is history, an audit actor included', async ({ context }) => {
    await context.db.insert(auditEvents).values([
      { actorUserId: 'veteran', entityType: 'customer', entityId: 'c-1', action: 'created', summary: 'Created' },
      // An event *about* a User references it by text, not by key, and is not history.
      { actorUserId: null, entityType: 'user', entityId: 'fresh', action: 'updated', summary: 'Updated' },
    ]);

    await expect(getUserRemovalVerdict({ db: context.db, userId: 'fresh' })).resolves.toEqual({ hasHistory: false });
    await expect(getUserRemovalVerdict({ db: context.db, userId: 'veteran' })).resolves.toEqual({ hasHistory: true });
  });
});
