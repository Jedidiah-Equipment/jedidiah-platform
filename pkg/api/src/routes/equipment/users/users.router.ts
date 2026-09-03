import {
  getUserById,
  isUserCoreError,
  listUsers,
  setUserDepartments,
  setUserIsDevice,
  type UserCoreError,
  updateUserThumbnail,
} from '@pkg/core';
import { AuthId, Department, NullableThumbnailDataUrl } from '@pkg/schema';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { getApiConfig } from '@/env.js';

import { createAuth } from '../../../app-auth.js';
import { type CoreErrorMapping, mapKnownCoreError } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';

const config = getApiConfig();

const UserDepartmentInput = z.object({
  departments: z.array(Department),
  userId: AuthId,
});

const UserDeviceInput = z.object({
  isDevice: z.boolean(),
  userId: AuthId,
});

const UserThumbnailInput = z.object({
  thumbnailDataUrl: NullableThumbnailDataUrl,
  userId: AuthId,
});

export const usersRouter = router({
  list: authorizedProcedure('user:list').query(({ ctx }) => listUsers({ db: ctx.db })),
  setDepartments: authorizedProcedure('user:update')
    .input(UserDepartmentInput)
    .mutation(async ({ ctx, input }) => {
      await mapUserErrors(() =>
        setUserDepartments({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          departments: input.departments,
          userId: input.userId,
        }),
      );
    }),
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

      await createAuth(ctx.db).api.sendVerificationEmail({
        body: {
          callbackURL: `${config.APP_BASE_URL}/login`,
          email: targetUser.email,
        },
      });
    }),
});

async function mapUserErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isUserCoreError, mapUserCoreError);
}

function mapUserCoreError(error: UserCoreError): CoreErrorMapping<UserCoreError['code']> {
  return userErrorMappings[error.code];
}

const userErrorMappings = {
  'user.is_device': {
    appCode: 'user.is_device',
    code: 'BAD_REQUEST',
    message: 'A shared device has no badge card.',
  },
  'user.not_found': {
    appCode: 'user.not_found',
    code: 'NOT_FOUND',
    message: 'User not found.',
  },
} satisfies {
  [TCode in UserCoreError['code']]: CoreErrorMapping<TCode>;
};
