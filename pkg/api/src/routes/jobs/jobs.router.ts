import {
  completeJobStage,
  createJob,
  getJob,
  JobNotFoundError,
  JobStageTransitionDeniedError,
  listJobs,
  setJobStageStatus,
  startJobStage,
} from '@pkg/core';
import { JobCreateInput, JobListInput, JobStageStatusInput, JobStageTransitionInput, UUID } from '@pkg/schema';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

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

  setStageStatus: authorizedProcedure('job-stage:update')
    .input(JobStageStatusInput)
    .mutation(({ ctx, input }) =>
      mapJobErrors(() =>
        setJobStageStatus({
          access: ctx.access,
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          input,
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
});

async function mapJobErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Job not found.',
      });
    }

    if (error instanceof JobStageTransitionDeniedError) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: error.message,
      });
    }

    throw error;
  }
}
