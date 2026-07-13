import type { AppEnv, Changelog } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { selectUnseenChangelogs } from './changelog-visibility.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const ACCOUNT_CREATED = new Date('2026-01-01T00:00:00.000Z');

function changelog(releasedAt: string): Changelog {
  return {
    releasedAt,
    sections: [{ surface: 'app', entries: [{ title: 'Something', description: 'A visible change.' }] }],
  } as Changelog;
}

function select(overrides: {
  appEnv?: AppEnv;
  changelogs?: Changelog[];
  accountCreatedAt?: Date;
  lastSeenReleaseAt?: Date | null;
}) {
  return selectUnseenChangelogs({
    appEnv: overrides.appEnv ?? 'production',
    changelogs: overrides.changelogs ?? [],
    now: NOW,
    accountCreatedAt: overrides.accountCreatedAt ?? ACCOUNT_CREATED,
    lastSeenReleaseAt: overrides.lastSeenReleaseAt ?? null,
  });
}

function releasedDates(changelogs: Changelog[]): string[] {
  return changelogs.map((changelog) => changelog.releasedAt);
}

describe('selectUnseenChangelogs', () => {
  it('returns nothing outside production', () => {
    const changelogs = [changelog('2026-06-10T00:00:00.000Z')];
    for (const appEnv of ['development', 'staging'] as const) {
      expect(select({ appEnv, changelogs })).toEqual([]);
    }
  });

  it('hides changelogs older than the 30-day window', () => {
    const fresh = changelog('2026-06-01T00:00:00.000Z');
    const stale = changelog('2026-05-01T00:00:00.000Z');

    expect(releasedDates(select({ changelogs: [fresh, stale] }))).toEqual([fresh.releasedAt]);
  });

  it('applies the 30-day window as an exact server-time delta', () => {
    // NOW is 2026-06-15T12:00:00Z, so exactly 30 days earlier is 2026-05-16T12:00:00Z.
    const exactlyThirtyDays = changelog('2026-05-16T12:00:00.000Z');
    const justOverThirtyDays = changelog('2026-05-16T11:59:59.000Z');

    expect(releasedDates(select({ changelogs: [exactlyThirtyDays, justOverThirtyDays] }))).toEqual([
      exactlyThirtyDays.releasedAt,
    ]);
  });

  it('hides changelogs at or below the high-water mark', () => {
    const seen = changelog('2026-06-05T00:00:00.000Z');
    const unseen = changelog('2026-06-10T00:00:00.000Z');

    expect(releasedDates(select({ changelogs: [seen, unseen], lastSeenReleaseAt: new Date(seen.releasedAt) }))).toEqual(
      [unseen.releasedAt],
    );
  });

  it('hides changelogs released at or before account creation', () => {
    const beforeAccount = changelog('2026-06-05T00:00:00.000Z');
    const afterAccount = changelog('2026-06-10T00:00:00.000Z');

    expect(
      releasedDates(
        select({ changelogs: [beforeAccount, afterAccount], accountCreatedAt: new Date('2026-06-07T00:00:00.000Z') }),
      ),
    ).toEqual([afterAccount.releasedAt]);
  });

  it('returns surviving changelogs oldest-first', () => {
    const newer = changelog('2026-06-12T00:00:00.000Z');
    const older = changelog('2026-06-02T00:00:00.000Z');
    const middle = changelog('2026-06-08T00:00:00.000Z');

    expect(releasedDates(select({ changelogs: [newer, older, middle] }))).toEqual([
      older.releasedAt,
      middle.releasedAt,
      newer.releasedAt,
    ]);
  });
});
