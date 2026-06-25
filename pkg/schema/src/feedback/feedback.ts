import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { DateIso } from '../common/date.js';
import { Department } from '../common/departments.js';
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

export type FeedbackDepartmentTargets = z.infer<typeof FeedbackDepartmentTargets>;
export const FeedbackDepartmentTargets = z.array(Department).min(1, 'Select at least one department');

export type FeedbackUserTargets = z.infer<typeof FeedbackUserTargets>;
export const FeedbackUserTargets = z.array(AuthId).min(1, 'Select at least one user');

export type FeedbackSubmitInput = z.infer<typeof FeedbackSubmitInput>;
// Discriminated on Kind: `general` carries no targets, while the corrective kinds each require at
// least one target of the matching type. The matching DB join table is written from these targets.
export const FeedbackSubmitInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('general'),
    subject: FeedbackSubjectInput,
    text: FeedbackText,
  }),
  z.object({
    kind: z.literal('corrective-feedback-department'),
    subject: FeedbackSubjectInput,
    text: FeedbackText,
    departments: FeedbackDepartmentTargets,
  }),
  z.object({
    kind: z.literal('corrective-feedback-user'),
    subject: FeedbackSubjectInput,
    text: FeedbackText,
    userIds: FeedbackUserTargets,
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
  departments: z.array(Department),
  userIds: z.array(AuthId),
  internalNotes: z.string().nullable(),
  status: FeedbackStatus,
  createdAt: DateIso,
  updatedAt: DateIso,
});

// Minimal user shape any signed-in submitter may read to populate the corrective-user target picker;
// deliberately narrower than the admin-only `user:list` payload.
export type FeedbackTargetUser = z.infer<typeof FeedbackTargetUser>;
export const FeedbackTargetUser = z.object({
  id: AuthId,
  name: z.string(),
});

export type FeedbackTargetUserList = z.infer<typeof FeedbackTargetUserList>;
export const FeedbackTargetUserList = z.object({
  users: z.array(FeedbackTargetUser),
});
