import {
  countOpenFeedback,
  type FeedbackCoreError,
  getFeedback,
  isFeedbackCoreError,
  listFeedback,
  listFeedbackTargetUsers,
  submitFeedback,
  updateFeedback,
} from '@pkg/core';
import { FeedbackDetailInput, FeedbackListInput, FeedbackSubmitInput, FeedbackUpdateInput } from '@pkg/schema';

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
