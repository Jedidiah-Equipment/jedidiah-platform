import { z } from 'zod';

import { DateIso, DateOnlyIso } from '../common/date.js';
import { WorkItemDepartment } from '../common/departments.js';
import { createCursorQueryResult, createSearchedSortedCursorQueryInput } from '../common/pagination.js';
import { JobCode } from '../common/public-code.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';
import { UUID } from '../common/uuid.js';
import { DocumentContentType, DocumentFilename } from '../documents/document.js';
import { FeedbackSubmitter, FeedbackText } from '../feedback/feedback.js';
import { JobDescription } from '../jobs/job.js';
import { QuoteKind } from '../quotes/quote-shared.js';

/** The Job an activity item is about, carrying what the feed needs to place it without a second read. */
export type JobActivityJobRef = z.infer<typeof JobActivityJobRef>;
export const JobActivityJobRef = z.object({
  id: UUID,
  code: JobCode,
  /** The Product being built, or a Custom Job's work title. */
  displayName: z.string().trim().min(1),
  offeringKind: QuoteKind,
  /** The Product thumbnail; null on Custom work or a Product without one. */
  thumbnailDataUrl: NullableThumbnailDataUrl,
  /** Null means Stock: the machine behind this Job belongs to no Customer. */
  customerCompanyName: z.string().trim().min(1).nullable(),
});

export type GeneralFeedbackActivityItem = z.infer<typeof GeneralFeedbackActivityItem>;
export const GeneralFeedbackActivityItem = z.object({
  type: z.literal('general-feedback'),
  id: UUID,
  occurredAt: DateIso,
  job: JobActivityJobRef,
  // No Status: it is a fact about the inbox queue, and this feed is read to catch up rather than to
  // triage, so a subject surface never shows it (CONTEXT.md, Feedback).
  feedback: z.object({
    submitter: FeedbackSubmitter,
    text: FeedbackText,
  }),
});

/**
 * Who performed a change event, when a person did. Null covers two cases the audit row cannot tell
 * apart — the platform itself acted (the Job completion sweep audits with a null actor on purpose),
 * or the user who acted has since been deleted and the actor FK nulled their id rather than
 * cascading the event away. Readers render both as System, as the Audit table already does.
 */
export type JobActivityActor = z.infer<typeof JobActivityActor>;
// The same shape a Feedback submitter has, and deliberately the same export: both are just the
// person an entry attributes itself to, rendered the same way in the same feed.
export const JobActivityActor = FeedbackSubmitter;

/**
 * What every change event carries. The payload beyond this is curated per type: the raw
 * `audit_events.changes` jsonb never crosses the API boundary, which is what lets the whole feed
 * stay gated `job:read` while raw audit reads stay `equipment_audit:read` (ADR 0015).
 */
const jobChangeActivityShape = {
  id: UUID,
  occurredAt: DateIso,
  job: JobActivityJobRef,
  actor: JobActivityActor.nullable(),
} as const;

export type JobCreatedActivityItem = z.infer<typeof JobCreatedActivityItem>;
export const JobCreatedActivityItem = z.object({
  type: z.literal('job-created'),
  ...jobChangeActivityShape,
});

export type JobDescriptionUpdatedActivityItem = z.infer<typeof JobDescriptionUpdatedActivityItem>;
export const JobDescriptionUpdatedActivityItem = z.object({
  type: z.literal('job-description-updated'),
  ...jobChangeActivityShape,
  // Null reads as the description having been cleared, which is a change worth showing.
  description: JobDescription,
});

export type JobCompletedActivityItem = z.infer<typeof JobCompletedActivityItem>;
export const JobCompletedActivityItem = z.object({
  type: z.literal('job-completed'),
  ...jobChangeActivityShape,
  completedOn: DateOnlyIso,
});

export type JobDocumentAddedActivityItem = z.infer<typeof JobDocumentAddedActivityItem>;
export const JobDocumentAddedActivityItem = z.object({
  type: z.literal('job-document-added'),
  ...jobChangeActivityShape,
  document: z.object({
    contentType: DocumentContentType,
    filename: DocumentFilename,
  }),
});

export type JobWorkTimeActivityAction = z.infer<typeof JobWorkTimeActivityAction>;
export const JobWorkTimeActivityAction = z.enum(['started', 'completed', 'corrected', 'cleared']);

export type JobWorkTimeActivityState = z.infer<typeof JobWorkTimeActivityState>;
export const JobWorkTimeActivityState = z.object({
  startedAt: DateIso,
  completedAt: DateIso.nullable(),
  // Names are snapshotted into the audit event so the activity remains historically truthful when
  // a crew member is renamed or removed later.
  crew: z.array(z.string().trim().min(1)),
});

export type JobWorkTimeUpdatedActivityItem = z.infer<typeof JobWorkTimeUpdatedActivityItem>;
export const JobWorkTimeUpdatedActivityItem = z.object({
  type: z.literal('job-work-time-updated'),
  ...jobChangeActivityShape,
  action: JobWorkTimeActivityAction,
  department: WorkItemDepartment,
  /** Null only when a mistaken timing record was cleared. */
  timing: JobWorkTimeActivityState.nullable(),
});

export type JobChangeActivityItem = z.infer<typeof JobChangeActivityItem>;
export const JobChangeActivityItem = z.discriminatedUnion('type', [
  JobCreatedActivityItem,
  JobDescriptionUpdatedActivityItem,
  JobCompletedActivityItem,
  JobDocumentAddedActivityItem,
  JobWorkTimeUpdatedActivityItem,
]);

/**
 * One entry in the Job Activity feed: what was said about a Job (General Feedback), a curated Job
 * Event, or a curated Work Time change. The sources — `feedback` and `audit_events` — meet only here,
 * merged by when they occurred.
 */
export type JobActivityItem = z.infer<typeof JobActivityItem>;
export const JobActivityItem = z.discriminatedUnion('type', [
  GeneralFeedbackActivityItem,
  JobCreatedActivityItem,
  JobDescriptionUpdatedActivityItem,
  JobCompletedActivityItem,
  JobDocumentAddedActivityItem,
  JobWorkTimeUpdatedActivityItem,
]);

export type JobActivityType = JobActivityItem['type'];

export type JobActivitySortBy = z.infer<typeof JobActivitySortBy>;
export const JobActivitySortBy = z.enum(['occurredAt']);

export type JobActivityFilter = z.infer<typeof JobActivityFilter>;
export const JobActivityFilter = z.enum(['all', 'user-feedback', 'job-events', 'work-times']);

export type JobActivitySeenInput = z.infer<typeof JobActivitySeenInput>;
export const JobActivitySeenInput = z.object({
  seenAt: DateIso,
});

export type JobActivityListInput = z.infer<typeof JobActivityListInput>;
export const JobActivityListInput = createSearchedSortedCursorQueryInput({
  defaultSortDirection: 'desc',
  shape: {
    filter: JobActivityFilter.default('all'),
    jobId: UUID.optional(),
  },
  sortBy: JobActivitySortBy.default('occurredAt'),
});

export type JobActivityListResult = z.infer<typeof JobActivityListResult>;
export const JobActivityListResult = createCursorQueryResult(JobActivityItem);
