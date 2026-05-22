import {
  cancelJob,
  completeJobStage,
  createJob,
  createJobFromQuote,
  editJobDate,
  getJob,
  isJobCoreError,
  type JobCoreError,
  listJobs,
  pauseJob,
  resumeJob,
  startJobStage,
  startStationBooking,
  stopStationBooking,
  uncancelJob,
} from '@pkg/core';
import {
  JobCreateFromQuoteInput,
  JobCreateInput,
  JobDateEditInput,
  JobLifecycleTransitionInput,
  JobListInput,
  JobStageTransitionInput,
  JobStationBookingTransitionInput,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const jobsRouter = router({
  list: authorizedProcedure('job:read')
    .input(JobListInput)
    .query(({ ctx, input }) => listJobs({ db: ctx.db, access: ctx.access, input })),

  get: authorizedProcedure('job:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapJobErrors(() => getJob({ db: ctx.db, access: ctx.access, id: input.id }))),

  create: authorizedProcedure('job:create')
    .input(JobCreateInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => createJob({ db: ctx.db, access: ctx.access, input, actorUserId: ctx.session.user.id })),
    ),

  createFromQuote: authorizedProcedure('job:create')
    .input(JobCreateFromQuoteInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() =>
        createJobFromQuote({ db: ctx.db, access: ctx.access, input, actorUserId: ctx.session.user.id }),
      ),
    ),

  pause: authorizedProcedure('job:update')
    .input(JobLifecycleTransitionInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() =>
        pauseJob({
          access: ctx.access,
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          id: input.id,
        }),
      ),
    ),

  resume: authorizedProcedure('job:update')
    .input(JobLifecycleTransitionInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() =>
        resumeJob({
          access: ctx.access,
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          id: input.id,
        }),
      ),
    ),

  cancel: authorizedProcedure('job:update')
    .input(JobLifecycleTransitionInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() =>
        cancelJob({
          access: ctx.access,
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          id: input.id,
        }),
      ),
    ),

  uncancel: authorizedProcedure('job:update')
    .input(JobLifecycleTransitionInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() =>
        uncancelJob({
          access: ctx.access,
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          id: input.id,
        }),
      ),
    ),

  editDate: authorizedProcedure('job:update')
    .input(JobDateEditInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() =>
        editJobDate({
          access: ctx.access,
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          input,
        }),
      ),
    ),

  startStage: authorizedProcedure('job-stage:update')
    .input(JobStageTransitionInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() =>
        startJobStage({
          access: ctx.access,
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          id: input.id,
          stage: input.stage,
        }),
      ),
    ),

  completeStage: authorizedProcedure('job-stage:update')
    .input(JobStageTransitionInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() =>
        completeJobStage({
          access: ctx.access,
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          id: input.id,
          stage: input.stage,
        }),
      ),
    ),

  startStationBooking: authorizedProcedure('job-stage:update')
    .input(JobStationBookingTransitionInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() =>
        startStationBooking({
          access: ctx.access,
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          id: input.id,
        }),
      ),
    ),

  stopStationBooking: authorizedProcedure('job-stage:update')
    .input(JobStationBookingTransitionInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() =>
        stopStationBooking({
          access: ctx.access,
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          id: input.id,
        }),
      ),
    ),
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
    case 'job.date_edit_target_not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Date target not found.',
      };
    case 'job.date_edit_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.date_edit_invalid':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: error.message,
      };
    case 'job.station_booking_not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Station booking not found.',
      };
    case 'job.station_booking_transition_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.stage_transition_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.lifecycle_transition_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.create_from_quote_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    default:
      return assertNever(error);
  }
}
