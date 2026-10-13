import { registerPushToken } from '@pkg/core';
import { PushTokenRegisterInput } from '@pkg/schema';
import { mapCoreErrors } from '../../trpc/errors.js';
import { protectedProcedure, router } from '../../trpc/init.js';
import { pushErrorFamily } from './push-errors.js';

/**
 * Any signed-in person may register their install; who is pinged is each business's decision, server-side. Nothing
 * unregisters: the row is bound to the session and goes when the session does.
 */
export const pushTokensRouter = router({
  register: protectedProcedure
    .input(PushTokenRegisterInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => registerPushToken({ db: ctx.db, userId: ctx.session.user.id, sessionId: ctx.session.session.id, input }),
        pushErrorFamily,
      ),
    ),
});
