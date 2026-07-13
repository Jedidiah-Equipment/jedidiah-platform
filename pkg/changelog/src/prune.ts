import { CHANGELOG_WINDOW_DAYS } from '@pkg/schema';
import { differenceInCalendarDays } from 'date-fns';

export interface ChangelogFileRef {
  /** Path used to remove the file later. Opaque to selection. */
  path: string;
  /** ISO release timestamp read from the file. */
  releasedAt: string;
}

/**
 * Selects the changelog files that are older than `maxAgeDays` relative to `now` and can no longer
 * be displayed, so the release commit can drop them. A file released exactly `maxAgeDays` calendar
 * days ago is kept (still within the window); pruning is strictly older-than to avoid removing a
 * changelog the API would still show.
 */
export function selectStaleChangelogs(
  files: readonly ChangelogFileRef[],
  now: Date,
  maxAgeDays: number = CHANGELOG_WINDOW_DAYS,
): string[] {
  return files
    .filter((file) => differenceInCalendarDays(now, new Date(file.releasedAt)) > maxAgeDays)
    .map((file) => file.path);
}
