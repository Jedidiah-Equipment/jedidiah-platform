import { listJobActivity } from '@pkg/core';
import { JobActivityListInput } from '@pkg/schema';

import { authorizedProcedure, router } from '../../trpc/init.js';

export const jobActivityRouter = router({
  // A Job's general feedback is public to job readers (ADR 0010) and this feed reads nothing else,
  // so `job:read` is the whole gate. The change events of #1169 arrive with their own gating.
  list: authorizedProcedure('job:read')
    .input(JobActivityListInput)
    .query(({ ctx, input }) => listJobActivity({ db: ctx.db, input })),
});
