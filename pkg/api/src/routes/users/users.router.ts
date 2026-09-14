import {
  getUserById,
  isUserNotFoundError,
  listUsers,
  setUserIsDevice,
  type UserNotFoundError,
  updateUserThumbnail,
} from '@pkg/core';
import { AuthId, NullableThumbnailDataUrl, UserListInput } from '@pkg/schema';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getApiConfig } from '@/env.js';
import { type CoreErrorMapping, mapKnownCoreError } from '@/trpc/errors.js';
import { authorizedProcedure, router } from '@/trpc/init.js';

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
    .query(({ ctx, input }) => listUsers({ business: input.business, db: ctx.db })),
  /**
   * Whether the account is a shared device. Gated on `user:set-role`, not `user:update`: it decides
   * whether the account may sign for stock at all, which is the same class of decision as granting
   * it a role — and a stronger one than editing a profile.
   */
  setDevice: authorizedProcedure('user:set-role')
    .input(UserDeviceInput)
    .mutation(({ ctx, input }) =>
      mapUserErrors(() =>
        setUserIsDevice({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          isDevice: input.isDevice,
          userId: input.userId,
        }),
      ),
    ),
  updateThumbnail: authorizedProcedure('user:update')
    .input(UserThumbnailInput)
    .mutation(({ ctx, input }) =>
      mapUserErrors(() =>
        updateUserThumbnail({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          thumbnailDataUrl: input.thumbnailDataUrl,
          userId: input.userId,
        }),
      ),
    ),
  sendVerificationEmail: authorizedProcedure('user:update')
    .input(z.object({ userId: AuthId }))
    .mutation(async ({ ctx, input }) => {
      const targetUser = await mapUserErrors(() => getUserById({ db: ctx.db, userId: input.userId }));

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

export async function mapUserErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isUserNotFoundError, mapUserNotFoundError);
}

function mapUserNotFoundError(_error: UserNotFoundError): CoreErrorMapping<'user.not_found'> {
  return {
    appCode: 'user.not_found',
    code: 'NOT_FOUND',
    message: 'User not found.',
  };
}
