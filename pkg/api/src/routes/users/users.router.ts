import { listUsers, setUserDepartments } from '@pkg/core';
import { AuthId, Department } from '@pkg/schema';
import { z } from 'zod';

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
      await setUserDepartments({
        actorUserId: ctx.session.user.id,
        db: ctx.db,
        departments: input.departments,
        userId: input.userId,
      });
    }),
});
