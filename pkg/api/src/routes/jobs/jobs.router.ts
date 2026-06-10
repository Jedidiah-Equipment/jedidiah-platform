import {
  addBayCalendarException,
  addIdleJobSlot,
  bookJobSlot,
  createJob,
  createJobBay,
  getJob,
  isJobCoreError,
  type JobCoreError,
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
} from '@pkg/core';
import {
  AddBayCalendarExceptionInput,
  AddIdleJobSlotInput,
  BookJobSlotInput,
  JobBayCreateInput,
  JobBayListInput,
  JobBayRenameInput,
  JobBaySetDisabledInput,
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

  toggleOffDay: authorizedProcedure('job:update-calendar')
    .input(ToggleOffDayInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => toggleOffDay({ db: ctx.db, access: ctx.access, input }))),

  list: authorizedProcedure('job:read')
    .input(JobListInput)
    .query(({ ctx, input }) => listJobs({ db: ctx.db, access: ctx.access, input })),

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
    .mutation(({ ctx, input }) => mapJobErrors(() => bookJobSlot({ db: ctx.db, access: ctx.access, input }))),

  addIdleSlot: authorizedProcedure('job:schedule')
    .input(AddIdleJobSlotInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => addIdleJobSlot({ db: ctx.db, access: ctx.access, input }))),

  addBayException: authorizedProcedure('job:schedule')
    .input(AddBayCalendarExceptionInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => addBayCalendarException({ db: ctx.db, access: ctx.access, input })),
    ),

  removeBayException: authorizedProcedure('job:schedule')
    .input(RemoveBayCalendarExceptionInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => removeBayCalendarException({ db: ctx.db, access: ctx.access, input })),
    ),

  resizeSlot: authorizedProcedure('job:schedule')
    .input(ResizeJobSlotInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => resizeJobSlot({ db: ctx.db, access: ctx.access, input }))),

  moveSlot: authorizedProcedure('job:schedule')
    .input(MoveJobSlotInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => moveJobSlot({ db: ctx.db, access: ctx.access, actorUserId: ctx.session.user.id, input })),
    ),

  removeSlot: authorizedProcedure('job:schedule')
    .input(RemoveJobSlotInput)
    .mutation(({ ctx, input }) => mapJobErrors(() => removeJobSlot({ db: ctx.db, access: ctx.access, input }))),
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
    case 'job.slot_booking_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.slot_idle_add_denied':
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
    case 'job.slot_resize_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.slot_remove_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.slot_move_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.calendar_edit_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    default:
      return assertNever(error);
  }
}
