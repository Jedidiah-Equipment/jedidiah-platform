import { getContractingActivityView, listActivity, markContractingActivitySeen } from '@pkg/core/contracting';
import { activityPermissions } from '@pkg/domain/contracting';
import { ActivitySeenInput } from '@pkg/schema';
import { ActivityListInput } from '@pkg/schema/contracting';
import { authorizedProcedure, router } from '../../../trpc/init.js';

/**
 * Contracting Activity. The gate is the one rule the phone tab, the web route and the nav ask: a Jobs reach or a
 * Workshop reach. Inside, `listActivity` scopes every branch to what the caller may read.
 */
export const contractingActivityRouter = router({
  list: authorizedProcedure(activityPermissions)
    .input(ActivityListInput)
    .query(({ ctx, input }) => listActivity({ db: ctx.db, actor: ctx.access, input })),
  getLastSeen: authorizedProcedure(activityPermissions).query(({ ctx }) =>
    getContractingActivityView({ db: ctx.db, actor: ctx.access }),
  ),
  setLastSeen: authorizedProcedure(activityPermissions)
    .input(ActivitySeenInput)
    .mutation(({ ctx, input }) => markContractingActivitySeen({ db: ctx.db, actor: ctx.access, seenAt: input.seenAt })),
});
