import {
  countOpenFeedback,
  type FeedbackCoreError,
  getFeedback,
  isFeedbackCoreError,
  listFeedback,
  listFeedbackTargetUsers,
  listJobFeedback,
  submitFeedback,
  updateFeedback,
  updateJobFeedback,
} from '@pkg/core';
import {
  FeedbackDetailInput,
  FeedbackListInput,
  FeedbackSubmitInput,
  FeedbackUpdateInput,
  JobFeedbackListInput,
  JobFeedbackUpdateInput,
} from '@pkg/schema';

import { type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, protectedProcedure, router } from '../../trpc/init.js';

export const feedbackRouter = router({
  // No `feedback:create` permission: any authenticated caller may submit.
  submit: protectedProcedure
    .input(FeedbackSubmitInput)
    .mutation(({ ctx, input }) =>
      mapFeedbackErrors(() => submitFeedback({ db: ctx.db, input, submitterId: ctx.session.user.id })),
    ),
  // Minimal user list any submitter may read to populate the corrective-user target picker.
  listTargetUsers: protectedProcedure.query(({ ctx }) => listFeedbackTargetUsers({ db: ctx.db })),
  list: authorizedProcedure('feedback:read')
    .input(FeedbackListInput)
    .query(({ ctx, input }) => listFeedback({ db: ctx.db, input })),
  openCount: authorizedProcedure('feedback:read').query(({ ctx }) => countOpenFeedback({ db: ctx.db })),
  get: authorizedProcedure('feedback:read')
    .input(FeedbackDetailInput)
    .query(({ ctx, input }) => getFeedback({ db: ctx.db, input })),
  update: authorizedProcedure('feedback:update')
    .input(FeedbackUpdateInput)
    .mutation(({ ctx, input }) => mapFeedbackErrors(() => updateFeedback({ db: ctx.db, input }))),
  // A Job's `general` feedback is public to job readers, and job writers may move its status;
  // corrective feedback and internal notes stay behind `feedback:read`/`feedback:update` (ADR 0010).
  listJobFeedback: authorizedProcedure('job:read')
    .input(JobFeedbackListInput)
    .query(({ ctx, input }) => listJobFeedback({ db: ctx.db, input })),
  updateJobFeedback: authorizedProcedure('job:update')
    .input(JobFeedbackUpdateInput)
    .mutation(({ ctx, input }) => mapFeedbackErrors(() => updateJobFeedback({ db: ctx.db, input }))),
});

async function mapFeedbackErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isFeedbackCoreError, mapFeedbackCoreError);
}

function mapFeedbackCoreError(error: FeedbackCoreError): CoreErrorMapping<FeedbackCoreError['code']> {
  if (error.code === 'feedback.not_found') {
    return {
      appCode: error.code,
      code: 'NOT_FOUND',
      message: 'The feedback item could not be found.',
    };
  }

  return {
    appCode: error.code,
    code: 'NOT_FOUND',
    message: 'The Quote or Job this feedback is about could not be found.',
  };
}
