import {
  addBayCalendarException,
  addIdleJobSlot,
  assignJobBayOperator,
  bookJobSlot,
  createJob,
  createJobBay,
  getJob,
  isJobCoreError,
  type JobCoreError,
  listBayOperators,
  listBays,
  listJobBays,
  listJobs,
  moveJobSlot,
  removeBayCalendarException,
  removeJobSlot,
  renameJobBay,
  resizeJobSlot,
  setJobBayDisabled,
  toggleOffDay,
  unassignJobBayOperator,
} from '@pkg/core';
import {
  AddBayCalendarExceptionInput,
  AddIdleJobSlotInput,
  BookJobSlotInput,
  JobBayAssignOperatorInput,
  JobBayCreateInput,
  JobBayListInput,
  JobBayRenameInput,
  JobBaySetDisabledInput,
  JobBayUnassignOperatorInput,
  JobCreateInput,
  JobListInput,
  MoveJobSlotInput,
  RemoveBayCalendarExceptionInput,
  RemoveJobSlotInput,
  ResizeJobSlotInput,
  ToggleOffDayInput,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const jobsRouter = router({
  listBays: authorizedProcedure('job:read').query(({ ctx }) => listBays({ db: ctx.db })),

  listJobBays: authorizedProcedure(['job:read', 'job_bay:read'])
    .input(JobBayListInput)
    .query(({ ctx, input }) => listJobBays({ db: ctx.db, input })),

  createBay: authorizedProcedure('job_bay:update')
    .input(JobBayCreateInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => createJobBay({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
    ),

  renameBay: authorizedProcedure('job_bay:update')
    .input(JobBayRenameInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => renameJobBay({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
    ),

  setBayDisabled: authorizedProcedure('job_bay:update')
    .input(JobBaySetDisabledInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => setJobBayDisabled({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
    ),

  listBayOperators: authorizedProcedure('job_bay:update').query(({ ctx }) => listBayOperators({ db: ctx.db })),

  assignBayOperator: authorizedProcedure('job_bay:update')
    .input(JobBayAssignOperatorInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => assignJobBayOperator({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
    ),

  unassignBayOperator: authorizedProcedure('job_bay:update')
    .input(JobBayUnassignOperatorInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => unassignJobBayOperator({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
    ),

  toggleOffDay: authorizedProcedure('job:update-calendar')
    .input(ToggleOffDayInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => toggleOffDay({ db: ctx.db, input }))),

  list: authorizedProcedure('job:read')
    .input(JobListInput)
    .query(({ ctx, input }) => listJobs({ db: ctx.db, input })),

  get: authorizedProcedure('job:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapJobErrors(() => getJob({ db: ctx.db, id: input.id }))),

  create: authorizedProcedure('job:create')
    .input(JobCreateInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => createJob({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  bookSlot: authorizedProcedure('job:schedule')
    .input(BookJobSlotInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => bookJobSlot({ db: ctx.db, input }))),

  addIdleSlot: authorizedProcedure('job:schedule')
    .input(AddIdleJobSlotInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => addIdleJobSlot({ db: ctx.db, input }))),

  addBayException: authorizedProcedure('job:schedule')
    .input(AddBayCalendarExceptionInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => addBayCalendarException({ db: ctx.db, input }))),

  removeBayException: authorizedProcedure('job:schedule')
    .input(RemoveBayCalendarExceptionInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => removeBayCalendarException({ db: ctx.db, input }))),

  resizeSlot: authorizedProcedure('job:schedule')
    .input(ResizeJobSlotInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => resizeJobSlot({ db: ctx.db, input }))),

  moveSlot: authorizedProcedure('job:schedule')
    .input(MoveJobSlotInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => moveJobSlot({ db: ctx.db, actorUserId: ctx.session.user.id, input })),
    ),

  removeSlot: authorizedProcedure('job:schedule')
    .input(RemoveJobSlotInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => removeJobSlot({ db: ctx.db, input }))),
});

async function mapJobErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isJobCoreError, mapJobCoreError);
}

function mapJobCoreError(error: JobCoreError): CoreErrorMapping<JobCoreError['code']> {
  switch (error.code) {
    case 'job.not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Job not found.',
      };
    case 'job.create_from_quote_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.bay_not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Job bay not found.',
      };
    case 'job.bay_operator_not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Bay operator not found.',
      };
    case 'job.bay_operator_role_denied':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: error.message,
      };
    case 'job.bay_operator_assignment_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.bay_already_assigned':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: error.message,
      };
    case 'job.bay_operator_assignment_not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Bay has no current operator assignment.',
      };
    case 'job.slot_booking_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.slot_not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Job slot not found.',
      };
    default:
      return assertNever(error);
  }
}
