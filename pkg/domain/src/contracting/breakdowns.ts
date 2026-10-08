import type { AuthId, UserAccessSummary } from '@pkg/schema';
import {
  type BreakdownStatus,
  type BreakdownStatusCounts,
  type BreakdownSubjectKind,
  type BreakdownUrgency,
  breakdownStatuses,
} from '@pkg/schema/contracting';
import { hasPermission } from '../auth/authorization.js';
import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../theme/status-badge.js';
import { round1 } from './hours.js';
import { READING_PHOTO_POLICY } from './reading-photo-policy.js';

export const breakdownSubjectKindLabels: Record<BreakdownSubjectKind, string> = {
  machine: 'Machine',
  implement: 'Implement',
};
export const breakdownUrgencyLabels: Record<BreakdownUrgency, string> = {
  'code-red': 'Code Red',
  'code-green': 'Code Green',
};
/** Urgency shows as a flag icon on its chip tint, the same on web and mobile; `icon` paints the flag. */
export const breakdownUrgencyColorClassNames = {
  'code-red': { ...statusBadgeColorClassNames.red, icon: 'text-red-500' },
  'code-green': { ...statusBadgeColorClassNames.green, icon: 'text-emerald-500' },
} satisfies Record<BreakdownUrgency, BadgeColorClassNames & { icon: string }>;
/** What the screens call each status: the plain words the workshop uses, while the codes stay open / in-progress / solved. */
export const breakdownStatusLabels: Record<BreakdownStatus, string> = {
  open: 'Not fixed',
  'in-progress': 'Fixing',
  solved: 'Fixed',
};
/** The Equipment Job palette: waiting is green, under way is blue, done is grey. */
export const breakdownStatusColorClassNames = {
  open: statusBadgeColorClassNames.green,
  'in-progress': statusBadgeColorClassNames.blue,
  solved: statusBadgeColorClassNames.gray,
} satisfies Record<BreakdownStatus, BadgeColorClassNames & { dot: string }>;

/** How many Breakdowns the status counts hold across these statuses. */
export const breakdownStatusesCount = (
  counts: BreakdownStatusCounts | undefined,
  statuses: readonly BreakdownStatus[] = breakdownStatuses,
) => statuses.reduce((total, status) => total + (counts?.[status] ?? 0), 0);

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

export const breakdownPhotosPath = (breakdownId: string) =>
  `${BREAKDOWN_REPORT_PATH}/${encodeURIComponent(breakdownId)}/photos`;

export const breakdownPhotoPath = (breakdownId: string, photoId: string) =>
  `${breakdownPhotosPath(breakdownId)}/${encodeURIComponent(photoId)}`;

/** Breakdown photos follow the meter-photo limits: JPEG or PNG, at most 10 MB each. */
export const BREAKDOWN_PHOTO_POLICY = READING_PHOTO_POLICY;

/** Hours from report to Fixed, the span a solved Breakdown shows as "Report to Fixed"; null while unsolved. */
export function reportToSolvedHours({ reportedAt, solvedAt }: { reportedAt: string; solvedAt: string | null }) {
  if (solvedAt === null) return null;
  return round1(Math.max(0, Date.parse(solvedAt) - Date.parse(reportedAt)) / 3_600_000);
}
