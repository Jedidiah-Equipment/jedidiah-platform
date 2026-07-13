import type { AppEnv, Changelog } from '@pkg/schema';

const DAY_MS = 24 * 60 * 60 * 1000;

// A Changelog is shown for 30 days of server time after release. This tracks the release-time prune
// window (@pkg/changelog CHANGELOG_MAX_AGE_DAYS) closely enough that a file is never pruned while still
// inside this window; the reader applies the window itself rather than trusting pruning.
export const CHANGELOG_DISPLAY_WINDOW_DAYS = 30;

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

  const windowMs = CHANGELOG_DISPLAY_WINDOW_DAYS * DAY_MS;

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
