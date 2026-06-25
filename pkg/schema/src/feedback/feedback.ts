import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { DateIso } from '../common/date.js';
import { requiredTrimmedText } from '../common/text.js';
import { UUID } from '../common/uuid.js';

export type FeedbackKind = z.infer<typeof FeedbackKind>;
export const FeedbackKind = z.enum(['general', 'corrective-feedback-department', 'corrective-feedback-user']);

export type FeedbackStatus = z.infer<typeof FeedbackStatus>;
export const FeedbackStatus = z.enum(['open', 'resolved', 'closed']);

export type FeedbackSubjectType = z.infer<typeof FeedbackSubjectType>;
export const FeedbackSubjectType = z.enum(['quote', 'job']);

export type FeedbackText = z.infer<typeof FeedbackText>;
export const FeedbackText = requiredTrimmedText('Feedback is required');

export type FeedbackSubjectInput = z.infer<typeof FeedbackSubjectInput>;
export const FeedbackSubjectInput = z.discriminatedUnion('subjectType', [
  z.object({
    subjectType: z.literal('quote'),
    quoteId: UUID,
  }),
  z.object({
    subjectType: z.literal('job'),
    jobId: UUID,
  }),
]);

export type FeedbackSubmitInput = z.infer<typeof FeedbackSubmitInput>;
// A discriminated union on Kind keeps room for the corrective kinds added in later slices; only the
// `general` member (no targets) exists in this slice.
export const FeedbackSubmitInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('general'),
    subject: FeedbackSubjectInput,
    text: FeedbackText,
  }),
]);

export type Feedback = z.infer<typeof Feedback>;
export const Feedback = z.object({
  id: UUID,
  submitterId: AuthId,
  subjectType: FeedbackSubjectType,
  quoteId: UUID.nullable(),
  jobId: UUID.nullable(),
  kind: FeedbackKind,
  text: FeedbackText,
  internalNotes: z.string().nullable(),
  status: FeedbackStatus,
  createdAt: DateIso,
  updatedAt: DateIso,
});
