import { getUserById, listUsers, setUserIsDevice, updateUserThumbnail } from '@pkg/core';
import { AuthId, NullableThumbnailDataUrl, UserListInput } from '@pkg/schema';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getApiConfig } from '@/env.js';
import { mapCoreErrors } from '@/trpc/errors.js';
import { authorizedProcedure, router } from '@/trpc/init.js';
import { userErrorFamily } from '../shared-error-families.js';

const config = getApiConfig();

const UserDeviceInput = z.object({
  isDevice: z.boolean(),
  userId: AuthId,
});

const UserThumbnailInput = z.object({
  thumbnailDataUrl: NullableThumbnailDataUrl,
  userId: AuthId,
});

/**
 * The sign-in account and its role slots, shared by both businesses' user admin. Anything a business
 * owns about a User — Department Membership, the stores badge — has its own router in that business.
 */
export const usersRouter = router({
  list: authorizedProcedure('user:list')
    .input(UserListInput)
    .query(({ ctx, input }) => listUsers({ input, db: ctx.db })),
  /**
   * Whether the account is a shared device. Gated on `user:set-role`, not `user:update`: it decides
   * whether the account may sign for stock at all, which is the same class of decision as granting
   * it a role — and a stronger one than editing a profile.
   */
  setDevice: authorizedProcedure('user:set-role')
    .input(UserDeviceInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () =>
          setUserIsDevice({
            actorUserId: ctx.session.user.id,
            db: ctx.db,
            isDevice: input.isDevice,
            userId: input.userId,
          }),
        userErrorFamily,
      ),
    ),
  updateThumbnail: authorizedProcedure('user:update')
    .input(UserThumbnailInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () =>
          updateUserThumbnail({
            actorUserId: ctx.session.user.id,
            db: ctx.db,
            thumbnailDataUrl: input.thumbnailDataUrl,
            userId: input.userId,
          }),
        userErrorFamily,
      ),
    ),
  sendVerificationEmail: authorizedProcedure('user:update')
    .input(z.object({ userId: AuthId }))
    .mutation(async ({ ctx, input }) => {
      const targetUser = await mapCoreErrors(() => getUserById({ db: ctx.db, userId: input.userId }), userErrorFamily);

      if (targetUser.emailVerified) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email is already verified.' });
      }

      await ctx.auth.api.sendVerificationEmail({
        body: {
          callbackURL: `${config.APP_BASE_URL}/login`,
          email: targetUser.email,
        },
      });
    }),
});
