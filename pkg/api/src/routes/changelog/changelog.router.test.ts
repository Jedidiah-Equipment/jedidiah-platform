import { changelogView, type Db, eq, user } from '@pkg/db';
import type { AppRole, Changelog } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

const DAY_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_CREATED = new Date('2020-01-01T00:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function changelog(releasedAt: string, title = 'Feature'): Changelog {
  return {
    releasedAt,
    sections: [{ surface: 'app', entries: [{ title, description: 'A user-visible change.' }] }],
  } as Changelog;
}

/** A session for `test-user-id` whose account was created at `createdAt` (drives the account-cutoff rule). */
function sessionWithAccountCreatedAt(createdAt: Date, role: AppRole = 'admin') {
  const session = mockSession(role);
  session.user.createdAt = createdAt;
  return session;
}

function releasedDates(changelogs: Changelog[]): string[] {
  return changelogs.map((entry) => entry.releasedAt);
}

async function readMark(db: Db): Promise<Date | null> {
  const [row] = await db
    .select({ lastSeenReleaseAt: changelogView.lastSeenReleaseAt })
    .from(changelogView)
    .where(eq(changelogView.userId, 'test-user-id'));
  return row?.lastSeenReleaseAt ?? null;
}

describe('changelog.unseen', () => {
  test('rejects unauthenticated callers', async ({ context }) => {
    await expect(context.createAnonCaller().changelog.unseen()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('returns unseen changelogs for every signed-in role', async ({ context }) => {
    const recent = changelog(daysAgo(5));

    for (const role of [
      'admin',
      'super-admin',
      'procurement-manager',
      'job-viewer',
      'sales',
      'bay-operator',
    ] as const) {
      const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED, role), {
        changelogLoader: () => [recent],
      });

      expect(releasedDates(await caller.changelog.unseen())).toEqual([recent.releasedAt]);
    }
  });

  test('returns nothing when the API is not running in production', async ({ context }) => {
    const recent = changelog(daysAgo(5));

    for (const appEnv of ['development', 'staging'] as const) {
      const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED), {
        appEnv,
        changelogLoader: () => [recent],
      });

      expect(await caller.changelog.unseen()).toEqual([]);
    }
  });

  test('hides changelogs older than the 30-day window', async ({ context }) => {
    const fresh = changelog(daysAgo(5));
    const stale = changelog(daysAgo(40));
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED), {
      changelogLoader: () => [fresh, stale],
    });

    expect(releasedDates(await caller.changelog.unseen())).toEqual([fresh.releasedAt]);
  });

  test('hides changelogs at or below the high-water mark', async ({ context }) => {
    const seen = changelog(daysAgo(10));
    const unseen = changelog(daysAgo(3));
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED), {
      changelogLoader: () => [seen, unseen],
    });

    await caller.changelog.markSeen({ releasedAt: seen.releasedAt });

    expect(releasedDates(await caller.changelog.unseen())).toEqual([unseen.releasedAt]);
  });

  test('hides changelogs released at or before account creation', async ({ context }) => {
    const beforeAccount = changelog(daysAgo(10));
    const afterAccount = changelog(daysAgo(3));
    const caller = context.createCaller(sessionWithAccountCreatedAt(new Date(daysAgo(7))), {
      changelogLoader: () => [beforeAccount, afterAccount],
    });

    expect(releasedDates(await caller.changelog.unseen())).toEqual([afterAccount.releasedAt]);
  });

  test('returns changelogs oldest-first', async ({ context }) => {
    const newest = changelog(daysAgo(2));
    const oldest = changelog(daysAgo(20));
    const middle = changelog(daysAgo(9));
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED), {
      changelogLoader: () => [newest, oldest, middle],
    });

    expect(releasedDates(await caller.changelog.unseen())).toEqual([
      oldest.releasedAt,
      middle.releasedAt,
      newest.releasedAt,
    ]);
  });
});

describe('changelog.markSeen', () => {
  test('rejects unauthenticated callers', async ({ context }) => {
    await expect(context.createAnonCaller().changelog.markSeen({ releasedAt: daysAgo(1) })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('advances the high-water mark', async ({ context }) => {
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED));
    const releasedAt = daysAgo(3);

    await caller.changelog.markSeen({ releasedAt });

    expect(await readMark(context.db)).toEqual(new Date(releasedAt));
  });

  test('does not regress the mark when called with an older release', async ({ context }) => {
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED));
    const newer = daysAgo(3);
    const older = daysAgo(20);

    await caller.changelog.markSeen({ releasedAt: newer });
    await caller.changelog.markSeen({ releasedAt: older });

    expect(await readMark(context.db)).toEqual(new Date(newer));
  });

  test('advances the mark forward on a newer release', async ({ context }) => {
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED));
    const older = daysAgo(20);
    const newer = daysAgo(3);

    await caller.changelog.markSeen({ releasedAt: older });
    await caller.changelog.markSeen({ releasedAt: newer });

    expect(await readMark(context.db)).toEqual(new Date(newer));
  });
});

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'admin',
    updatedAt: now,
  });
}
