import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../common/date.js';
import { createCursorQueryResult, createSortedCursorQueryInput } from '../common/pagination.js';
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
 * Who performed a change event. Null when the acting user has since been deleted: the audit row's
 * actor FK clears rather than cascading, so the event survives the person who caused it.
 */
export type JobActivityActor = z.infer<typeof JobActivityActor>;
export const JobActivityActor = z.object({
  email: z.email(),
  id: AuthId,
  name: z.string().trim().min(1),
  thumbnailDataUrl: NullableThumbnailDataUrl,
});

/**
 * What every change event carries. The payload beyond this is curated per type: the raw
 * `audit_events.changes` jsonb never crosses the API boundary, which is what lets the whole feed
 * stay gated `job:read` while raw audit reads stay `audit:read` (ADR 0015).
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

export type JobChangeActivityItem = z.infer<typeof JobChangeActivityItem>;
export const JobChangeActivityItem = z.discriminatedUnion('type', [
  JobCreatedActivityItem,
  JobDescriptionUpdatedActivityItem,
  JobCompletedActivityItem,
  JobDocumentAddedActivityItem,
]);

/**
 * One entry in the Job Activity feed: what was said about a Job (General Feedback) or what was done
 * to it (a change event). The two come from different tables — `feedback` and `audit_events` — and
 * meet only here, merged by when they occurred.
 */
export type JobActivityItem = z.infer<typeof JobActivityItem>;
export const JobActivityItem = z.discriminatedUnion('type', [
  GeneralFeedbackActivityItem,
  JobCreatedActivityItem,
  JobDescriptionUpdatedActivityItem,
  JobCompletedActivityItem,
  JobDocumentAddedActivityItem,
]);

export type JobActivityType = JobActivityItem['type'];

export type JobActivitySortBy = z.infer<typeof JobActivitySortBy>;
export const JobActivitySortBy = z.enum(['occurredAt']);

export type JobActivityListInput = z.infer<typeof JobActivityListInput>;
export const JobActivityListInput = createSortedCursorQueryInput({
  defaultSortDirection: 'desc',
  shape: {},
  sortBy: JobActivitySortBy.default('occurredAt'),
});

export type JobActivityListResult = z.infer<typeof JobActivityListResult>;
export const JobActivityListResult = createCursorQueryResult(JobActivityItem);
