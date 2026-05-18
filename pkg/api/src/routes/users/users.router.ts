import { isUserCoreError, listUsers, setUserDepartments, type UserCoreError } from '@pkg/core';
import { AuthId, Department } from '@pkg/schema';
import { z } from 'zod';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

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
});

async function mapUserErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isUserCoreError, mapUserCoreError);
}

function mapUserCoreError(error: UserCoreError): CoreErrorMapping<UserCoreError['code']> {
  switch (error.code) {
    case 'user.not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'User not found.',
      };
  }

  return assertNever(error as never);
}
