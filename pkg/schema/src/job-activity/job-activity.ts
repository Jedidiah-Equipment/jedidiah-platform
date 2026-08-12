import { z } from 'zod';

import { DateIso } from '../common/date.js';
import { createCursorQueryResult, createSortedCursorQueryInput } from '../common/pagination.js';
import { JobCode } from '../common/public-code.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';
import { UUID } from '../common/uuid.js';
import { FeedbackSubmitter, FeedbackText } from '../feedback/feedback.js';
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
 * One entry in the Job Activity feed. A union of exactly one member today: the discriminator is
 * here so the entity change events of #1169 join the same list contract without reshaping it.
 */
export type JobActivityItem = z.infer<typeof JobActivityItem>;
export const JobActivityItem = z.discriminatedUnion('type', [GeneralFeedbackActivityItem]);

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
