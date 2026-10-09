import type { ServiceDueStatus } from '@pkg/schema/contracting';
import { formatHours } from '../formatting/number.js';
import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../theme/status-badge.js';
import { round1 } from './hours.js';
import { round2 } from './pricing.js';

/** Within this many hours of Next Service Due a Machine is Service Due Soon, so filters can be ordered in time. */
export const SERVICE_DUE_SOON_THRESHOLD_HOURS = 100;

export type ServiceDueFacts = { latestReadingHours: number | null; nextServiceDueHours: number | null };

/** Hours left on the meter before Next Service Due; negative once it has passed. */
export const hoursToService = ({ latestReadingHours, nextServiceDueHours }: ServiceDueFacts) =>
  latestReadingHours === null || nextServiceDueHours === null ? null : round1(nextServiceDueHours - latestReadingHours);

export function serviceDueStatus(
  facts: ServiceDueFacts,
  threshold = SERVICE_DUE_SOON_THRESHOLD_HOURS,
): ServiceDueStatus {
  const remaining = hoursToService(facts);
  if (remaining === null) return 'unknown';
  if (remaining < 0) return 'overdue';
  return remaining <= threshold ? 'due-soon' : 'ok';
}

/** Pre-fill for the sticker: the reading at service plus the interval, when the Machine has one. */
export const suggestedNextServiceDue = (readingAtServiceHours: number, serviceIntervalHours: number | null) =>
  serviceIntervalHours === null ? null : round2(readingAtServiceHours + serviceIntervalHours);

/** Due soon or overdue: the statuses a screen paints in their warning colour. */
export const serviceDueNeedsAttention = (status: ServiceDueStatus) => status === 'due-soon' || status === 'overdue';

/** What is left before Next Service Due, in the reader's words, on every surface that shows it. */
export const hoursToServiceLabel = (hoursToService: number) =>
  hoursToService < 0 ? `Overdue by ${formatHours(-hoursToService)}` : `${formatHours(hoursToService)} to go`;

/** Who a Machine is busy with: the Job when the reader may see it, else its Job Number alone. */
export const machineBusyWith = <TJob extends { jobNumber: string }>(machine: {
  busyOnJob: TJob | null;
  onSiteJobNumber: string | null;
}): { job: TJob | null; jobNumber: string } | null =>
  machine.busyOnJob
    ? { job: machine.busyOnJob, jobNumber: machine.busyOnJob.jobNumber }
    : machine.onSiteJobNumber
      ? { job: null, jobNumber: machine.onSiteJobNumber }
      : null;

export const serviceDueStatusLabels: Record<ServiceDueStatus, string> = {
  unknown: 'Service due unknown',
  ok: 'Service on track',
  'due-soon': 'Service due soon',
  overdue: 'Service overdue',
};
export const serviceDueStatusColorClassNames: Record<ServiceDueStatus, BadgeColorClassNames> = {
  unknown: statusBadgeColorClassNames.gray,
  ok: statusBadgeColorClassNames.green,
  'due-soon': statusBadgeColorClassNames.orange,
  overdue: statusBadgeColorClassNames.red,
};
