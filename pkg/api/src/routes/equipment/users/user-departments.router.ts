import { listUserDepartmentMemberships, setUserDepartments } from '@pkg/core/equipment';
import { AuthId } from '@pkg/schema';
import { Department } from '@pkg/schema/equipment';
import { z } from 'zod';
import { mapUserErrors } from '@/routes/users/users.router.js';
import { authorizedProcedure, router } from '@/trpc/init.js';

const UserDepartmentInput = z.object({
  departments: z.array(Department),
  userId: AuthId,
});

/** Department Membership: the equipment side of user admin, read beside the shared account list. */
export const userDepartmentsRouter = router({
  list: authorizedProcedure('user:list').query(({ ctx }) => listUserDepartmentMemberships({ db: ctx.db })),
  set: authorizedProcedure('user:update')
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
