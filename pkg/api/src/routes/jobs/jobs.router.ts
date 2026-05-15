import { createJob, getJob, JobNotFoundError, listJobs } from '@pkg/core';
import { JobCreateInput, JobListInput, UUID } from '@pkg/schema';
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
    .mutation(({ ctx, input }) => mapJobErrors(() => createJob({ db: ctx.db, input }))),
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

    throw error;
  }
}
