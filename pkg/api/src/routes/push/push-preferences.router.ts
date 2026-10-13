import { getPushPreferences, setPushPreferences } from '@pkg/core';
import { PushPreferencesSetInput } from '@pkg/schema';
import { mapCoreErrors } from '../../trpc/errors.js';
import { protectedProcedure, router } from '../../trpc/init.js';
import { pushErrorFamily } from './push-tokens.router.js';

/** Each signed-in person's own muted Push Kinds; a mute only stops pushes, never the feeds or badges. */
export const pushPreferencesRouter = router({
  get: protectedProcedure.query(({ ctx }) =>
    mapCoreErrors(() => getPushPreferences({ db: ctx.db, userId: ctx.session.user.id }), pushErrorFamily),
  ),
  set: protectedProcedure
    .input(PushPreferencesSetInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => setPushPreferences({ db: ctx.db, userId: ctx.session.user.id, input }), pushErrorFamily),
    ),
});
