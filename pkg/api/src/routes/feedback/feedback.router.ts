import { type FeedbackCoreError, isFeedbackCoreError, submitFeedback } from '@pkg/core';
import { FeedbackSubmitInput } from '@pkg/schema';

import { type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { protectedProcedure, router } from '../../trpc/init.js';

export const feedbackRouter = router({
  // No `feedback:create` permission: any authenticated caller may submit.
  submit: protectedProcedure
    .input(FeedbackSubmitInput)
    .mutation(({ ctx, input }) =>
      mapFeedbackErrors(() => submitFeedback({ db: ctx.db, input, submitterId: ctx.session.user.id })),
    ),
});

async function mapFeedbackErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isFeedbackCoreError, mapFeedbackCoreError);
}

function mapFeedbackCoreError(error: FeedbackCoreError): CoreErrorMapping<FeedbackCoreError['code']> {
  return {
    appCode: error.code,
    code: 'NOT_FOUND',
    message: 'The Quote or Job this feedback is about could not be found.',
  };
}
