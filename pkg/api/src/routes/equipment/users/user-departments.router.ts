import { listEquipmentUsers, listUserDepartmentMemberships, setUserDepartments } from '@pkg/core/equipment';
import { AuthId } from '@pkg/schema';
import { Department, EquipmentUserListInput } from '@pkg/schema/equipment';
import { z } from 'zod';
import { userErrorFamily } from '@/routes/shared-error-families.js';
import { mapCoreErrors } from '@/trpc/errors.js';
import { authorizedProcedure, router } from '@/trpc/init.js';

const UserDepartmentInput = z.object({
  departments: z.array(Department),
  userId: AuthId,
});

/** Department Membership: the equipment side of user admin, read beside the shared account list. */
export const userDepartmentsRouter = router({
  listUsers: authorizedProcedure('user:list')
    .input(EquipmentUserListInput)
    .query(({ ctx, input }) => listEquipmentUsers({ db: ctx.db, input })),
  list: authorizedProcedure('user:list').query(({ ctx }) => listUserDepartmentMemberships({ db: ctx.db })),
  set: authorizedProcedure('user:update')
    .input(UserDepartmentInput)
    .mutation(async ({ ctx, input }) => {
      await mapCoreErrors(
        () =>
          setUserDepartments({
            actorUserId: ctx.session.user.id,
            db: ctx.db,
            departments: input.departments,
            userId: input.userId,
          }),
        userErrorFamily,
      );
    }),
});
