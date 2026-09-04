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
} from '@pkg/core/equipment';
import {
  FeedbackDetailInput,
  FeedbackListInput,
  FeedbackSubmitInput,
  FeedbackUpdateInput,
  JobFeedbackListInput,
  JobFeedbackUpdateInput,
} from '@pkg/schema/equipment';

import { type CoreErrorMapping, mapKnownCoreError } from '../../../trpc/errors.js';
import { authorizedProcedure, businessProcedure, router } from '../../../trpc/init.js';

const equipmentProcedure = businessProcedure('equipment');

export const feedbackRouter = router({
  // No `equipment_feedback:create` permission: any authenticated Equipment caller may submit.
  submit: equipmentProcedure
    .input(FeedbackSubmitInput)
    .mutation(({ ctx, input }) =>
      mapFeedbackErrors(() => submitFeedback({ db: ctx.db, input, submitterId: ctx.session.user.id })),
    ),
  // Minimal user list any submitter may read to populate the corrective-user target picker.
  listTargetUsers: equipmentProcedure.query(({ ctx }) => listFeedbackTargetUsers({ db: ctx.db })),
  list: authorizedProcedure('equipment_feedback:read')
    .input(FeedbackListInput)
    .query(({ ctx, input }) => listFeedback({ db: ctx.db, input })),
  openCount: authorizedProcedure('equipment_feedback:read').query(({ ctx }) => countOpenFeedback({ db: ctx.db })),
  get: authorizedProcedure('equipment_feedback:read')
    .input(FeedbackDetailInput)
    .query(({ ctx, input }) => getFeedback({ db: ctx.db, input })),
  update: authorizedProcedure('equipment_feedback:update')
    .input(FeedbackUpdateInput)
    .mutation(({ ctx, input }) => mapFeedbackErrors(() => updateFeedback({ db: ctx.db, input }))),
  // A Job's `general` feedback is public to job readers, and job writers may move its status;
  // corrective feedback and internal notes stay behind `equipment_feedback:read`/`equipment_feedback:update` (ADR 0010).
  listJobFeedback: authorizedProcedure('equipment_job:read')
    .input(JobFeedbackListInput)
    .query(({ ctx, input }) => listJobFeedback({ db: ctx.db, input })),
  updateJobFeedback: authorizedProcedure('equipment_job:update')
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
