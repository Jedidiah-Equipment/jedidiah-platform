import { type AppEnv, CHANGELOG_WINDOW_DAYS, type Changelog } from '@pkg/schema';

const DAY_MS = 24 * 60 * 60 * 1000;

export type SelectUnseenChangelogsParams = {
  appEnv: AppEnv;
  changelogs: readonly Changelog[];
  now: Date;
  accountCreatedAt: Date;
  lastSeenReleaseAt: Date | null;
};

/**
 * The single source of truth for Changelog visibility. Applies all four rules — production gate,
 * 30-day window, high-water mark, and account-creation cutoff — and returns the survivors oldest-first.
 * Pure: every input is a value, so clients cannot drift.
 */
export function selectUnseenChangelogs({
  appEnv,
  changelogs,
  now,
  accountCreatedAt,
  lastSeenReleaseAt,
}: SelectUnseenChangelogsParams): Changelog[] {
  if (appEnv !== 'production') return [];

  const windowMs = CHANGELOG_WINDOW_DAYS * DAY_MS;

  return changelogs
    .filter((changelog) => {
      const releasedAt = new Date(changelog.releasedAt);
      if (now.getTime() - releasedAt.getTime() > windowMs) return false;
      if (lastSeenReleaseAt && releasedAt <= lastSeenReleaseAt) return false;
      if (releasedAt <= accountCreatedAt) return false;
      return true;
    })
    .sort((a, b) => new Date(a.releasedAt).getTime() - new Date(b.releasedAt).getTime());
}
