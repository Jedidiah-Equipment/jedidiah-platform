import { getUserById, isUserCoreError, listUsers, setUserDepartments, type UserCoreError } from '@pkg/core';
import { AuthId, Department } from '@pkg/schema';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { getApiConfig } from '@/env.js';

import { createAuth } from '../../auth/auth.js';
import { type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

const config = getApiConfig();

const UserDepartmentInput = z.object({
  departments: z.array(Department),
  userId: AuthId,
});

export const usersRouter = router({
  list: authorizedProcedure('user:list').query(({ ctx }) => listUsers({ db: ctx.db })),
  setDepartments: authorizedProcedure('user:assign-departments')
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
  'user.not_found': {
    appCode: 'user.not_found',
    code: 'NOT_FOUND',
    message: 'User not found.',
  },
} satisfies {
  [TCode in UserCoreError['code']]: CoreErrorMapping<TCode>;
};
