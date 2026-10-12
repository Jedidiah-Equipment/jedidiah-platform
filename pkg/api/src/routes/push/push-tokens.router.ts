import { isPushError, type PushError, registerPushToken, unregisterPushToken } from '@pkg/core';
import { PushTokenRegisterInput, PushTokenUnregisterInput } from '@pkg/schema';
import { defineCoreErrorFamily, mapCoreErrors } from '../../trpc/errors.js';
import { protectedProcedure, router } from '../../trpc/init.js';

export const pushErrorFamily = defineCoreErrorFamily<PushError>({
  codes: { 'push.device_account': 'FORBIDDEN' },
  is: isPushError,
});

/** Any signed-in person may register their install; who is pinged is each business's decision, server-side. */
export const pushTokensRouter = router({
  register: protectedProcedure
    .input(PushTokenRegisterInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => registerPushToken({ db: ctx.db, userId: ctx.session.user.id, input }), pushErrorFamily),
    ),
  unregister: protectedProcedure
    .input(PushTokenUnregisterInput)
    .mutation(({ ctx, input }) => unregisterPushToken({ db: ctx.db, userId: ctx.session.user.id, token: input.token })),
});
