import { getActivityView, setActivityView } from '@pkg/core';
import { listActivity } from '@pkg/core/contracting';
import { ActivitySeenInput } from '@pkg/schema';
import { ActivityListInput } from '@pkg/schema/contracting';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { businessProcedure, router } from '../../../trpc/init.js';
import { activityErrorFamily } from '../contracting-error-families.js';

/**
 * Contracting Activity. A business-presence gate only: the reach is an either-of (a Jobs reach or a Workshop reach),
 * so `listActivity` refuses inside with `activity.forbidden` and scopes every branch to what the caller may read.
 */
export const contractingActivityRouter = router({
  list: businessProcedure('contracting')
    .input(ActivityListInput)
    .query(({ ctx, input }) =>
      mapCoreErrors(() => listActivity({ db: ctx.db, actor: ctx.access, input }), activityErrorFamily),
    ),
  getLastSeen: businessProcedure('contracting').query(({ ctx }) =>
    getActivityView({ db: ctx.db, userId: ctx.session.user.id, business: 'contracting' }),
  ),
  setLastSeen: businessProcedure('contracting')
    .input(ActivitySeenInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(async () => {
        const latest = await listActivity({
          db: ctx.db,
          actor: ctx.access,
          input: ActivityListInput.parse({ limit: 1 }),
        });
        return setActivityView({
          db: ctx.db,
          userId: ctx.session.user.id,
          business: 'contracting',
          seenAt: input.seenAt,
          latestActivityAt: latest.items[0]?.occurredAt ?? null,
        });
      }, activityErrorFamily),
    ),
});
