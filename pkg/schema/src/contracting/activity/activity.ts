import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { SearchText } from '../../common/text.js';
import { NullableThumbnailDataUrl } from '../../common/thumbnail.js';
import { UUID } from '../../common/uuid.js';
import { BreakdownSubject, CloseOutNote } from '../breakdowns/breakdown.js';
import { breakdownStatuses, breakdownUrgencies } from '../breakdowns/breakdown-enums.js';
import { CategoryColour, CategoryIconKey } from '../fleet/fleet.js';
import { NoteText } from '../notes/note.js';

export const activityFilters = ['all', 'notes', 'breakdowns', 'jobs', 'hours'] as const;
export const ActivityFilter = z.enum(activityFilters);
export type ActivityFilter = z.infer<typeof ActivityFilter>;

export const ActivityActor = z.object({
  id: AuthId,
  name: z.string().trim().min(1),
  thumbnailDataUrl: NullableThumbnailDataUrl,
});
export type ActivityActor = z.infer<typeof ActivityActor>;
export const ActivityJobRef = z.object({
  id: UUID,
  jobNumber: z.string(),
  farmName: z.string(),
  customerName: z.string(),
  foremanUserId: AuthId.nullable(),
});
export type ActivityJobRef = z.infer<typeof ActivityJobRef>;
export const ActivityBreakdownRef = z.object({
  id: UUID,
  urgency: z.enum(breakdownUrgencies),
  status: z.enum(breakdownStatuses),
  subject: BreakdownSubject,
  jobId: UUID.nullable(),
});
export type ActivityBreakdownRef = z.infer<typeof ActivityBreakdownRef>;
export const ActivityMachineRef = z.object({
  id: UUID,
  code: z.string(),
  categoryIcon: CategoryIconKey,
  categoryColour: CategoryColour,
});
export type ActivityMachineRef = z.infer<typeof ActivityMachineRef>;

/** Every item names when, who and (where it has one) which Job; a Breakdown item also names its Breakdown. */
const base = { id: UUID, occurredAt: DateIso, actor: ActivityActor } as const;
const onBreakdown = { breakdown: ActivityBreakdownRef, job: ActivityJobRef.nullable() } as const;

export const JobNoteActivityItem = z.object({
  type: z.literal('job-note'),
  ...base,
  job: ActivityJobRef,
  text: NoteText,
});
export const BreakdownNoteActivityItem = z.object({
  type: z.literal('breakdown-note'),
  ...base,
  ...onBreakdown,
  text: NoteText,
});
export const BreakdownReportedActivityItem = z.object({
  type: z.literal('breakdown-reported'),
  ...base,
  ...onBreakdown,
  firstLine: z.string(),
});
export const MechanicAssignedActivityItem = z.object({
  type: z.literal('mechanic-assigned'),
  ...base,
  ...onBreakdown,
  /** Null when the assignment cleared the Mechanic. */
  mechanicName: z.string().nullable(),
});
export const BreakdownStartedActivityItem = z.object({ type: z.literal('breakdown-started'), ...base, ...onBreakdown });
export const BreakdownSolvedActivityItem = z.object({
  type: z.literal('breakdown-solved'),
  ...base,
  ...onBreakdown,
  closeOutNote: CloseOutNote,
});
export const JobStartedActivityItem = z.object({
  type: z.literal('job-started'),
  ...base,
  job: ActivityJobRef,
  machine: ActivityMachineRef,
});
export const JobCompletedActivityItem = z.object({ type: z.literal('job-completed'), ...base, job: ActivityJobRef });
export const JobCancelledActivityItem = z.object({
  type: z.literal('job-cancelled'),
  ...base,
  job: ActivityJobRef,
  reason: z.string(),
});
/** `occurredAt` is when the server accepted the reading; `readAt` is the Read At, which may be backdated. */
const hoursShape = {
  ...base,
  job: ActivityJobRef,
  machine: ActivityMachineRef,
  hours: z.number(),
  readAt: DateIso,
  photoBacked: z.boolean(),
} as const;
export const MachineArrivedActivityItem = z.object({ type: z.literal('machine-arrived'), ...hoursShape });
export const MachineLeftActivityItem = z.object({ type: z.literal('machine-left'), ...hoursShape });

/** One entry in the Contracting Activity feed, read off the records themselves (ADR 0023). */
export const ActivityItem = z.discriminatedUnion('type', [
  JobNoteActivityItem,
  BreakdownNoteActivityItem,
  BreakdownReportedActivityItem,
  MechanicAssignedActivityItem,
  BreakdownStartedActivityItem,
  BreakdownSolvedActivityItem,
  JobStartedActivityItem,
  JobCompletedActivityItem,
  JobCancelledActivityItem,
  MachineArrivedActivityItem,
  MachineLeftActivityItem,
]);
export type ActivityItem = z.infer<typeof ActivityItem>;
export type ActivityItemType = ActivityItem['type'];

/** Keyset cursor: the last item of the previous page. Offsets re-scan the union; this never does. */
export const ActivityCursor = z.object({ occurredAt: DateIso, id: UUID }).strict();
export type ActivityCursor = z.infer<typeof ActivityCursor>;
/** Not strict: an infinite query also sends tRPC's own `direction`, which the list ignores. */
export const ActivityListInput = z.object({
  filter: ActivityFilter.default('all'),
  search: SearchText.optional(),
  jobId: UUID.optional(),
  breakdownId: UUID.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Null is tRPC's initial page param. */
  cursor: ActivityCursor.nullable().optional(),
});
export type ActivityListInput = z.infer<typeof ActivityListInput>;
/** No total: counting the union grows slower every month, and nothing shows it. */
export const ActivityListResult = z.object({ items: z.array(ActivityItem), nextCursor: ActivityCursor.nullable() });
export type ActivityListResult = z.infer<typeof ActivityListResult>;
