import { and, changelogView, type Db, eq, user } from '@pkg/db';
import type { Business, Changelog, ContractingRole, EquipmentRole } from '@pkg/schema';
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

const EQUIPMENT = { business: 'equipment' } as const;
const CONTRACTING = { business: 'contracting' } as const;

function changelog(releasedAt: string, business: Business = 'equipment', title = 'Feature'): Changelog {
  return {
    business,
    releasedAt,
    sections: [{ surface: 'app', entries: [{ title, description: 'A user-visible change.' }] }],
  } as Changelog;
}

/** A session for `test-user-id` whose account was created at `createdAt` (drives the account-cutoff rule). */
function sessionWithAccountCreatedAt(
  createdAt: Date,
  role: EquipmentRole | null = 'admin',
  contractingRole: ContractingRole | null = null,
) {
  const session = mockSession(role);
  session.user.createdAt = createdAt;
  session.user.contractingRole = contractingRole;
  return session;
}

function releasedDates(changelogs: Changelog[]): string[] {
  return changelogs.map((entry) => entry.releasedAt);
}

async function readMark(db: Db, business: Business = 'equipment'): Promise<Date | null> {
  const [row] = await db
    .select({ lastSeenReleaseAt: changelogView.lastSeenReleaseAt })
    .from(changelogView)
    .where(and(eq(changelogView.userId, 'test-user-id'), eq(changelogView.business, business)));
  return row?.lastSeenReleaseAt ?? null;
}

describe('changelog.unseen', () => {
  test('rejects unauthenticated callers', async ({ context }) => {
    await expect(context.createAnonCaller().changelog.unseen(EQUIPMENT)).rejects.toMatchObject({
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

      expect(releasedDates(await caller.changelog.unseen(EQUIPMENT))).toEqual([recent.releasedAt]);
    }
  });

  test('returns nothing when the API is not running in production', async ({ context }) => {
    const recent = changelog(daysAgo(5));

    for (const appEnv of ['development', 'staging'] as const) {
      const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED), {
        appEnv,
        changelogLoader: () => [recent],
      });

      expect(await caller.changelog.unseen(EQUIPMENT)).toEqual([]);
    }
  });

  test('hides changelogs older than the 30-day window', async ({ context }) => {
    const fresh = changelog(daysAgo(5));
    const stale = changelog(daysAgo(40));
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED), {
      changelogLoader: () => [fresh, stale],
    });

    expect(releasedDates(await caller.changelog.unseen(EQUIPMENT))).toEqual([fresh.releasedAt]);
  });

  test('hides changelogs at or below the high-water mark', async ({ context }) => {
    const seen = changelog(daysAgo(10));
    const unseen = changelog(daysAgo(3));
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED), {
      changelogLoader: () => [seen, unseen],
    });

    await caller.changelog.markSeen({ ...EQUIPMENT, releasedAt: seen.releasedAt });

    expect(releasedDates(await caller.changelog.unseen(EQUIPMENT))).toEqual([unseen.releasedAt]);
  });

  test('hides changelogs released at or before account creation', async ({ context }) => {
    const beforeAccount = changelog(daysAgo(10));
    const afterAccount = changelog(daysAgo(3));
    const caller = context.createCaller(sessionWithAccountCreatedAt(new Date(daysAgo(7))), {
      changelogLoader: () => [beforeAccount, afterAccount],
    });

    expect(releasedDates(await caller.changelog.unseen(EQUIPMENT))).toEqual([afterAccount.releasedAt]);
  });

  test('returns only the changelogs of the business asked for', async ({ context }) => {
    const equipment = changelog(daysAgo(5), 'equipment');
    const contracting = changelog(daysAgo(4), 'contracting');
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED, 'super-admin'), {
      changelogLoader: () => [equipment, contracting],
    });

    expect(releasedDates(await caller.changelog.unseen(EQUIPMENT))).toEqual([equipment.releasedAt]);
    expect(releasedDates(await caller.changelog.unseen(CONTRACTING))).toEqual([contracting.releasedAt]);
  });

  test('forbids a business the caller cannot access', async ({ context }) => {
    const equipmentOnly = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED, 'admin'), {
      changelogLoader: () => [changelog(daysAgo(5), 'contracting')],
    });
    await expect(equipmentOnly.changelog.unseen(CONTRACTING)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const contractingOnly = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED, null, 'driver'), {
      changelogLoader: () => [changelog(daysAgo(5), 'equipment')],
    });
    await expect(contractingOnly.changelog.unseen(EQUIPMENT)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('lets a contracting-only user read the contracting changelog', async ({ context }) => {
    const contracting = changelog(daysAgo(5), 'contracting');
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED, null, 'driver'), {
      changelogLoader: () => [contracting],
    });

    expect(releasedDates(await caller.changelog.unseen(CONTRACTING))).toEqual([contracting.releasedAt]);
  });

  test("keeps the two businesses' high-water marks independent", async ({ context }) => {
    const equipment = changelog(daysAgo(5), 'equipment');
    const contracting = changelog(daysAgo(4), 'contracting');
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED, 'super-admin'), {
      changelogLoader: () => [equipment, contracting],
    });

    await caller.changelog.markSeen({ ...EQUIPMENT, releasedAt: equipment.releasedAt });

    expect(await caller.changelog.unseen(EQUIPMENT)).toEqual([]);
    expect(releasedDates(await caller.changelog.unseen(CONTRACTING))).toEqual([contracting.releasedAt]);
  });

  test('returns changelogs oldest-first', async ({ context }) => {
    const newest = changelog(daysAgo(2));
    const oldest = changelog(daysAgo(20));
    const middle = changelog(daysAgo(9));
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED), {
      changelogLoader: () => [newest, oldest, middle],
    });

    expect(releasedDates(await caller.changelog.unseen(EQUIPMENT))).toEqual([
      oldest.releasedAt,
      middle.releasedAt,
      newest.releasedAt,
    ]);
  });
});

describe('changelog.markSeen', () => {
  test('rejects unauthenticated callers', async ({ context }) => {
    await expect(
      context.createAnonCaller().changelog.markSeen({ ...EQUIPMENT, releasedAt: daysAgo(1) }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('rejects a releasedAt that matches no released changelog', async ({ context }) => {
    const real = changelog(daysAgo(3));
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED), {
      changelogLoader: () => [real],
    });

    await expect(
      caller.changelog.markSeen({ ...EQUIPMENT, releasedAt: '9999-01-01T00:00:00.000Z' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(await readMark(context.db)).toBeNull();
  });

  test("rejects a release that exists only in the other business's changelog", async ({ context }) => {
    const contracting = changelog(daysAgo(3), 'contracting');
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED, 'super-admin'), {
      changelogLoader: () => [contracting],
    });

    await expect(caller.changelog.markSeen({ ...EQUIPMENT, releasedAt: contracting.releasedAt })).rejects.toMatchObject(
      {
        code: 'BAD_REQUEST',
      },
    );
    expect(await readMark(context.db)).toBeNull();
  });

  test('forbids marking a business the caller cannot access', async ({ context }) => {
    const contracting = changelog(daysAgo(3), 'contracting');
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED, 'admin'), {
      changelogLoader: () => [contracting],
    });

    await expect(
      caller.changelog.markSeen({ ...CONTRACTING, releasedAt: contracting.releasedAt }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await readMark(context.db, 'contracting')).toBeNull();
  });

  test('advances the high-water mark', async ({ context }) => {
    const released = changelog(daysAgo(3));
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED), {
      changelogLoader: () => [released],
    });

    await caller.changelog.markSeen({ ...EQUIPMENT, releasedAt: released.releasedAt });

    expect(await readMark(context.db)).toEqual(new Date(released.releasedAt));
  });

  test('does not regress the mark when called with an older release', async ({ context }) => {
    const newer = changelog(daysAgo(3));
    const older = changelog(daysAgo(20));
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED), {
      changelogLoader: () => [newer, older],
    });

    await caller.changelog.markSeen({ ...EQUIPMENT, releasedAt: newer.releasedAt });
    await caller.changelog.markSeen({ ...EQUIPMENT, releasedAt: older.releasedAt });

    expect(await readMark(context.db)).toEqual(new Date(newer.releasedAt));
  });

  test('advances the mark forward on a newer release', async ({ context }) => {
    const older = changelog(daysAgo(20));
    const newer = changelog(daysAgo(3));
    const caller = context.createCaller(sessionWithAccountCreatedAt(ACCOUNT_CREATED), {
      changelogLoader: () => [older, newer],
    });

    await caller.changelog.markSeen({ ...EQUIPMENT, releasedAt: older.releasedAt });
    await caller.changelog.markSeen({ ...EQUIPMENT, releasedAt: newer.releasedAt });

    expect(await readMark(context.db)).toEqual(new Date(newer.releasedAt));
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
