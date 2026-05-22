import {
  createJob,
  editJobDate,
  getJob,
  isJobCoreError,
  type JobCoreError,
  listJobs,
  listSharedStationBookings,
  setJobStatus,
  startStationBooking,
  stopStationBooking,
} from '@pkg/core';
import {
  JobCreateInput,
  JobDateEditInput,
  JobListInput,
  JobSetStatusInput,
  JobSharedStationBookingsInput,
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

  listSharedStationBookings: authorizedProcedure('job:read')
    .input(JobSharedStationBookingsInput)
    .query(({ ctx, input }) => mapJobErrors(() => listSharedStationBookings({ db: ctx.db, jobId: input.jobId }))),

  create: authorizedProcedure('job:create')
    .input(JobCreateInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() => createJob({ db: ctx.db, access: ctx.access, input, actorUserId: ctx.session.user.id })),
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

  setStatus: authorizedProcedure('job:update')
    .input(JobSetStatusInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() =>
        setJobStatus({
          access: ctx.access,
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          input,
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
    case 'job.create_from_quote_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'job.status_update_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    default:
      return assertNever(error);
  }
}
