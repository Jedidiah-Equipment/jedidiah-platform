import {
  countOpenFeedback,
  getFeedback,
  listFeedback,
  listFeedbackTargetUsers,
  listJobFeedback,
  listPurchaseOrderFeedback,
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
  PurchaseOrderFeedbackListInput,
} from '@pkg/schema/equipment';

import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, businessProcedure, router } from '../../../trpc/init.js';
import { feedbackErrorFamily } from '../equipment-error-families.js';

const equipmentProcedure = businessProcedure('equipment');

export const feedbackRouter = router({
  // No `equipment_feedback:create` permission: any authenticated Equipment caller may submit.
  submit: equipmentProcedure
    .input(FeedbackSubmitInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => submitFeedback({ db: ctx.db, input, submitterId: ctx.session.user.id }), feedbackErrorFamily),
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
    .mutation(({ ctx, input }) => mapCoreErrors(() => updateFeedback({ db: ctx.db, input }), feedbackErrorFamily)),
  // A Job's `general` feedback is public to job readers, and job writers may move its status;
  // corrective feedback and internal notes stay behind `equipment_feedback:read`/`equipment_feedback:update` (ADR 0010).
  listPurchaseOrderFeedback: authorizedProcedure('equipment_purchase_order:read')
    .input(PurchaseOrderFeedbackListInput)
    .query(({ ctx, input }) => listPurchaseOrderFeedback({ db: ctx.db, input })),
  listJobFeedback: authorizedProcedure('equipment_job:read')
    .input(JobFeedbackListInput)
    .query(({ ctx, input }) => listJobFeedback({ db: ctx.db, input })),
  updateJobFeedback: authorizedProcedure('equipment_job:update')
    .input(JobFeedbackUpdateInput)
    .mutation(({ ctx, input }) => mapCoreErrors(() => updateJobFeedback({ db: ctx.db, input }), feedbackErrorFamily)),
});
