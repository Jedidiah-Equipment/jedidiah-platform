import {
  bayWorkingCalendars,
  byBayDepartmentPipeline,
  deriveJobProgress,
  deriveJobRouteStop,
  getJobDisplayName,
  getNextJobIds,
  type JobProgress,
  type JobRouteStop,
  type JobStatusTone,
  type JobWorkSlotEntry,
  listEnabledBays,
  listNextWorkSlots,
  resolveJobStatusTone,
} from '@pkg/domain';
import type { BayOperator, BoardListResult, DateOnlyIso, Department, JobDetail, UUID } from '@pkg/schema';

/** One Bay on the Job's production-route timeline, projected from its Work Slot. */
export type JobRouteStopCard = JobRouteStop & {
  /** Slot id — stable key for the timeline. */
  slotId: string;
  bayId: UUID;
  bayName: string;
  department: Department;
  operator: BayOperator | null;
  /** Inclusive first working day — the Slot's queue span can open on an off-day. */
  firstWorkDay: DateOnlyIso;
  isNext: boolean;
};

export type JobDetailReadyState = {
  status: 'ready';
  cancelledAt: string | null;
  completedOn: DateOnlyIso | null;
  jobCode: string;
  quoteCode: string;
  jobDisplayName: string;
  productSerialNumber: string | null;
  productThumbnailDataUrl: string | null;
  customerCompanyName: string | null;
  description: string | null;
  /** The Job's Bays in department-pipeline order, each with its state, dates, and progress. */
  route: JobRouteStopCard[];
  /** Shared days-left + overall-progress projection; `null` once the Job has no unfinished Slot. */
  progress: JobProgress | null;
  tone: JobStatusTone;
  doneCount: number;
  totalCount: number;
  today: DateOnlyIso;
};

/** Pure projection seam shared by the hook and completed/unscheduled detail tests. */
export function projectJobDetail(job: JobDetail, board: BoardListResult): JobDetailReadyState {
  const { items: boardBays, offDays, today } = board;
  const scheduleBays = job.schedule.flatMap((department) => department.bays).sort(byBayDepartmentPipeline);
  const workingCalendarsByBayId = bayWorkingCalendars(scheduleBays, offDays);
  // Disabled Bays remain in historical routes, but they cannot define today's next Job.
  const enabledBoardBays = listEnabledBays(boardBays);
  const nextSlots = listNextWorkSlots(enabledBoardBays);
  const nextJobIds = getNextJobIds(enabledBoardBays);
  const nextSlotIds = new Set(nextSlots.map((slot) => slot.id));
  const entries: JobWorkSlotEntry[] = [];
  const route: JobRouteStopCard[] = [];

  for (const bay of scheduleBays) {
    const workingCalendar = workingCalendarsByBayId.get(bay.id) ?? {};
    for (const slot of bay.slots) {
      if (slot.jobId !== job.id) continue;
      entries.push({ slot, bayName: bay.name, workingCalendar });
      route.push({
        ...deriveJobRouteStop({ slot, today, workingCalendar }),
        slotId: slot.id,
        bayId: bay.id,
        bayName: bay.name,
        department: bay.department,
        operator: slot.operator,
        firstWorkDay: slot.firstWorkDay,
        isNext: nextSlotIds.has(slot.id),
      });
    }
  }

  const progress = deriveJobProgress({ slots: entries, today });

  return {
    status: 'ready',
    cancelledAt: job.cancelledAt,
    completedOn: job.completedOn,
    jobCode: job.code,
    // A Stock Build has no Quote; the Customer field already reads Stock, so the code just blanks.
    quoteCode: job.quoteCode ?? '—',
    jobDisplayName: getJobDisplayName(job),
    productSerialNumber: job.productUnit?.productSerialNumber ?? null,
    productThumbnailDataUrl: job.productThumbnailDataUrl,
    customerCompanyName: job.customerCompanyName,
    description: job.description,
    route,
    progress,
    tone: progress ? resolveJobStatusTone({ isNext: nextJobIds.has(job.id), status: progress.status }) : 'muted',
    doneCount: route.filter((stop) => stop.state === 'done').length,
    totalCount: route.length,
    today,
  };
}

export function isJobNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('data' in error)) return false;
  const data = error.data;

  return Boolean(data && typeof data === 'object' && 'code' in data && data.code === 'NOT_FOUND');
}
