import { listUsers, setUserRole, UserNotFoundError } from "@pkg/core";
import { UserSetRoleInput } from "@pkg/schema";
import { TRPCError } from "@trpc/server";

import { authorizedProcedure, router } from "../../trpc/init.js";

export const usersRouter = router({
  list: authorizedProcedure("user:list").query(({ ctx }) => listUsers(ctx.db)),

  setRole: authorizedProcedure("user:edit")
    .input(UserSetRoleInput)
    .mutation(({ ctx, input }) => {
      if (ctx.session.user.id === input.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot change your own role.",
        });
      }

      return mapUserErrors(() => setUserRole(ctx.db, input));
    }),
});

async function mapUserErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    throw error;
  }
}
