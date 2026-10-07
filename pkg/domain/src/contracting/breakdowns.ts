import type { AuthId, UserAccessSummary } from '@pkg/schema';
import type { BreakdownStatus, BreakdownUrgency } from '@pkg/schema/contracting';
import { hasPermission } from '../auth/authorization.js';
import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../theme/status-badge.js';
import { READING_PHOTO_POLICY } from './reading-photo-policy.js';

export const breakdownUrgencyLabels: Record<BreakdownUrgency, string> = {
  'code-red': 'Code Red',
  'code-green': 'Code Green',
};
export const breakdownUrgencyColorClassNames: Record<BreakdownUrgency, BadgeColorClassNames> = {
  'code-red': statusBadgeColorClassNames.red,
  'code-green': statusBadgeColorClassNames.green,
};
export const breakdownStatusLabels: Record<BreakdownStatus, string> = {
  open: 'Open',
  'in-progress': 'In Progress',
  solved: 'Solved',
};
export const breakdownStatusColorClassNames: Record<BreakdownStatus, BadgeColorClassNames> = {
  open: statusBadgeColorClassNames.orange,
  'in-progress': statusBadgeColorClassNames.blue,
  solved: statusBadgeColorClassNames.green,
};

/** Every Breakdown for `read`; for a `report` holder only, the ones that are theirs. */
export function breakdownReadScope(access: UserAccessSummary | null | undefined): 'all' | 'own' | null {
  if (hasPermission(access, 'contracting_breakdown:read')) return 'all';
  return hasPermission(access, 'contracting_breakdown:report') ? 'own' : null;
}

/** A Breakdown is "mine" when I reported it or it sits on a Job I am Foreman of. */
export function isBreakdownMine(
  subject: { reportedByUserId: AuthId; jobForemanUserId: AuthId | null },
  actorUserId: AuthId,
): boolean {
  return subject.reportedByUserId === actorUserId || subject.jobForemanUserId === actorUserId;
}

/** The description's first non-blank line, cut to `max` characters, for lists and push bodies. */
export function breakdownFirstLine(description: string, max = 120): string {
  const line =
    description
      .split('\n')
      .map((part) => part.trim())
      .find((part) => part !== '') ?? '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** The API route that reports a Breakdown with its photos, relative to the API origin. */
export const BREAKDOWN_REPORT_PATH = '/api/contracting/breakdowns';

/** The API route that adds photos to an existing Breakdown. */
export const breakdownPhotosPath = (breakdownId: string) =>
  `${BREAKDOWN_REPORT_PATH}/${encodeURIComponent(breakdownId)}/photos`;

/** The API route that serves one Breakdown photo. */
export const breakdownPhotoPath = (breakdownId: string, photoId: string) =>
  `${breakdownPhotosPath(breakdownId)}/${encodeURIComponent(photoId)}`;

/** Breakdown photos follow the meter-photo limits: JPEG or PNG, at most 10 MB each. */
export const BREAKDOWN_PHOTO_POLICY = READING_PHOTO_POLICY;
