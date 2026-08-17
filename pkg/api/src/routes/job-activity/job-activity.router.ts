import { listJobActivity } from '@pkg/core';
import { JobActivityListInput } from '@pkg/schema';

import { authorizedProcedure, router } from '../../trpc/init.js';

export const jobActivityRouter = router({
  // `job:read` is the whole gate for both halves of the feed: a Job's general feedback is public to
  // job readers (ADR 0010), and its change events are a curated projection of `audit_events` that
  // never carries the raw change set (ADR 0015). Raw audit reads stay behind `audit:read`.
  list: authorizedProcedure('job:read')
    .input(JobActivityListInput)
    .query(({ ctx, input }) => listJobActivity({ db: ctx.db, input })),
});
