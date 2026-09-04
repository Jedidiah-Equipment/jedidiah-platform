import { getLastActivitySeen, listJobActivity, setLastActivitySeen } from '@pkg/core';
import { JobActivityListInput, JobActivitySeenInput } from '@pkg/schema';

import { authorizedProcedure, router } from '../../../trpc/init.js';

export const jobActivityRouter = router({
  getLastActivitySeen: authorizedProcedure('equipment_job:read').query(({ ctx }) =>
    getLastActivitySeen({ db: ctx.db, userId: ctx.session.user.id }),
  ),
  // `job:read` is the whole gate for both halves of the feed: a Job's general feedback is public to
  // job readers (ADR 0010), and its change events are a curated projection of `audit_events` that
  // never carries the raw change set (ADR 0015). Raw audit reads stay behind `equipment_audit:read`.
  list: authorizedProcedure('equipment_job:read')
    .input(JobActivityListInput)
    .query(({ ctx, input }) => listJobActivity({ db: ctx.db, input })),
  setLastActivitySeen: authorizedProcedure('equipment_job:read')
    .input(JobActivitySeenInput)
    .mutation(({ ctx, input }) =>
      setLastActivitySeen({ db: ctx.db, seenAt: input.seenAt, userId: ctx.session.user.id }),
    ),
});
