import type { ServiceDueStatus, ServiceRecord, ServiceRecordStatus } from '@pkg/schema/contracting';
import { formatDate } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
import { getFirstName } from '../formatting/text.js';
import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../theme/status-badge.js';
import { round1 } from './hours.js';
import { round2 } from './pricing.js';

export type ServiceDueFacts = { latestReadingHours: number | null; nextServiceDueHours: number | null };

/** Hours left on the meter before Next Service Due; negative once it has passed. */
export const hoursToService = ({ latestReadingHours, nextServiceDueHours }: ServiceDueFacts) =>
  latestReadingHours === null || nextServiceDueHours === null ? null : round1(nextServiceDueHours - latestReadingHours);

/** The threshold a Machine is judged with: its own Service Alert Hours, else the Service Due Soon threshold in Settings. */
export const effectiveServiceAlertHours = (machine: { serviceAlertHours: number | null }, settingsThreshold: number) =>
  machine.serviceAlertHours ?? settingsThreshold;

/** `threshold` is the Machine's effective threshold: within that many hours of Next Service Due is due soon. */
export function serviceDueStatus(facts: ServiceDueFacts, threshold: number): ServiceDueStatus {
  const remaining = hoursToService(facts);
  if (remaining === null) return 'unknown';
  if (remaining < 0) return 'overdue';
  return remaining <= threshold ? 'due-soon' : 'ok';
}

/**
 * The Service Due Soon edge one capture can cross: the new latest reading needs attention while the one before it
 * (or no reading at all) did not. A second reading still inside does not cross it; a higher Next Service Due re-arms it.
 */
export const serviceDueSoonCrossed = ({
  previousHours,
  newHours,
  nextServiceDueHours,
  threshold,
}: {
  previousHours: number | null;
  newHours: number;
  nextServiceDueHours: number | null;
  threshold: number;
}) =>
  serviceDueNeedsAttention(serviceDueStatus({ latestReadingHours: newHours, nextServiceDueHours }, threshold)) &&
  !serviceDueNeedsAttention(serviceDueStatus({ latestReadingHours: previousHours, nextServiceDueHours }, threshold));

/** Pre-fill for the sticker: the reading at service plus the interval, when the Machine has one. */
export const suggestedNextServiceDue = (readingAtServiceHours: number, serviceIntervalHours: number | null) =>
  serviceIntervalHours === null ? null : round2(readingAtServiceHours + serviceIntervalHours);

/**
 * The close form's Next Service Due as a typed reading suggests it, until someone types over it: blank (NaN, as the
 * form holds a blank number) while the reading is blank or the Machine has no interval.
 */
export const suggestedNextServiceDueValue = (readingAtServiceHours: number, serviceIntervalHours: number | null) =>
  (Number.isNaN(readingAtServiceHours) ? null : suggestedNextServiceDue(readingAtServiceHours, serviceIntervalHours)) ??
  Number.NaN;

/** The line under the close form's Next Service Due, which says it was suggested only when it could have been. */
export const nextServiceDueHint = (serviceIntervalHours: number | null) =>
  serviceIntervalHours === null
    ? 'The hour reading printed on the sticker.'
    : 'The hour reading printed on the sticker. Suggested from the service interval; change it if the sticker says otherwise.';

/** Due soon or overdue: the statuses a screen paints in their warning colour. */
export const serviceDueNeedsAttention = (status: ServiceDueStatus) => status === 'due-soon' || status === 'overdue';

type MachineServiceState = { serviceDueStatus: ServiceDueStatus; bookedInServiceId: string | null };

/**
 * Due for Service: due soon or overdue with no open Service Record. Booking the Machine in takes it off before its
 * hours change. The Services page's pinned rows, the menu dot and the Dashboard all read this one predicate.
 */
export const isDueForService = ({ serviceDueStatus, bookedInServiceId }: MachineServiceState) =>
  serviceDueNeedsAttention(serviceDueStatus) && bookedInServiceId === null;

/** The Machines Due for Service: overdue first, then the fewest hours left; unknown is not urgency. */
export function machinesDueForService<
  T extends {
    code: string;
    serviceDueStatus: ServiceDueStatus;
    bookedInServiceId: string | null;
    hoursToService: number | null;
  },
>(machines: readonly T[]): T[] {
  const rank = (machine: T) => (machine.serviceDueStatus === 'overdue' ? 0 : 1);
  return machines
    .filter(isDueForService)
    .sort(
      (a, b) => rank(a) - rank(b) || (a.hoursToService ?? 0) - (b.hoursToService ?? 0) || a.code.localeCompare(b.code),
    );
}

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
export const serviceRecordStatusLabels: Record<ServiceRecordStatus, string> = { open: 'Booked in', closed: 'Closed' };
export const serviceRecordStatusColorClassNames = {
  open: statusBadgeColorClassNames.blue,
  closed: statusBadgeColorClassNames.gray,
} satisfies Record<ServiceRecordStatus, BadgeColorClassNames & { dot: string }>;

/** A Service Record's status as a badge: Booked in while open, Closed once closed out. */
export const serviceRecordBadge = (status: ServiceRecordStatus) => ({
  label: serviceRecordStatusLabels[status],
  colours: serviceRecordStatusColorClassNames[status],
});

/** A Service Record in one line: Booked in since its start with its Mechanic, or when it was closed and by whom. */
export function serviceRecordSummary(
  record: Pick<ServiceRecord, 'status' | 'startDate' | 'mechanicName' | 'closedAt' | 'closedByName'>,
) {
  if (record.status === 'closed')
    return `Closed ${formatDate(record.closedAt, 'short')}${record.closedByName ? ` by ${getFirstName(record.closedByName)}` : ''}`;
  return `Booked in since ${formatDate(record.startDate, 'short')}${record.mechanicName ? ` · ${getFirstName(record.mechanicName)}` : ''}`;
}

/** The service badge every surface shows for a Machine: Booked in while a Service Record is open, else its status. */
export function machineServiceBadge(machine: MachineServiceState): { label: string; colours: BadgeColorClassNames } {
  if (machine.bookedInServiceId !== null) return serviceRecordBadge('open');
  return {
    label: serviceDueStatusLabels[machine.serviceDueStatus],
    colours: serviceDueStatusColorClassNames[machine.serviceDueStatus],
  };
}
