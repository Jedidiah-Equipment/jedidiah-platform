import {
  CannotRemoveLastAdminError,
  EmailAlreadyInUseError,
  listUsers,
  mapUser,
  UserNotFoundError,
  updateUser,
} from "@pkg/core";
import { UserCreateInput, UserUpdateInput } from "@pkg/schema";
import { TRPCError } from "@trpc/server";

import { authorizedProcedure, router } from "../../trpc/init.js";

export const usersRouter = router({
  list: authorizedProcedure("user:list").query(({ ctx }) => listUsers(ctx.db)),

  create: authorizedProcedure("user:edit")
    .input(UserCreateInput)
    .mutation(async ({ ctx, input }) =>
      mapUserErrors(async () => {
        try {
          const result = await ctx.auth.api.createUser({
            body: {
              data: {
                emailVerified: input.emailVerified,
              },
              email: input.email,
              name: input.name,
              password: input.password,
              role: input.role,
            },
            headers: ctx.requestHeaders,
          });

          return mapUser(result.user);
        } catch (error) {
          if (isBetterAuthDuplicateEmailError(error)) {
            throw new EmailAlreadyInUseError(input.email);
          }

          throw error;
        }
      }),
    ),

  update: authorizedProcedure("user:edit")
    .input(UserUpdateInput)
    .mutation(({ ctx, input }) => {
      if (ctx.session.user.id === input.userId && input.role !== ctx.access.role) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot change your own role.",
        });
      }

      return mapUserErrors(async () => {
        const summary = await updateUser(ctx.db, input);

        if (input.password) {
          await ctx.auth.api.setUserPassword({
            body: {
              newPassword: input.password,
              userId: input.userId,
            },
            headers: ctx.requestHeaders,
          });
        }

        return summary;
      });
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

    if (error instanceof CannotRemoveLastAdminError) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You cannot remove the last admin.",
      });
    }

    if (error instanceof EmailAlreadyInUseError) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Email is already in use.",
      });
    }

    throw error;
  }
}

function isBetterAuthDuplicateEmailError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("User already exists")
  );
}
