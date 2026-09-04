import {
  getUserById,
  isUserCoreError,
  listUsers,
  setUserDepartments,
  setUserEquipmentRole,
  setUserIsDevice,
  type UserCoreError,
  updateUserThumbnail,
} from '@pkg/core';
import { AuthId, Department, EquipmentRole, NullableThumbnailDataUrl } from '@pkg/schema';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createAuth } from '@/app-auth.js';
import { getApiConfig } from '@/env.js';
import { type CoreErrorMapping, createAuthTRPCError, mapKnownCoreError } from '@/trpc/errors.js';
import { authorizedProcedure, router } from '@/trpc/init.js';

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
  clearEquipmentRole: authorizedProcedure('user:set-role')
    .input(z.object({ userId: AuthId }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.id === input.userId) {
        throw createAuthTRPCError({
          appCode: 'user.self_role_change',
          code: 'FORBIDDEN',
          message: 'You cannot change your own role.',
        });
      }

      const policy = await mapUserErrors(() =>
        setUserEquipmentRole({
          actorRole: EquipmentRole.parse(ctx.access.equipmentRole),
          db: ctx.db,
          role: null,
          userId: input.userId,
        }),
      );

      if (policy.allowed) {
        return;
      }

      if (policy.reason === 'last-admin') {
        throw createAuthTRPCError({
          appCode: 'user.last_admin',
          code: 'FORBIDDEN',
          message: 'You cannot remove the last admin.',
        });
      }

      if (policy.reason === 'reserved-super-admin') {
        throw createAuthTRPCError({
          appCode: 'user.reserved_super_admin',
          code: 'FORBIDDEN',
          message: 'Only a super admin can assign or remove the super admin role.',
        });
      }

      throw createAuthTRPCError({
        appCode: 'user.open_bay_operator_assignments',
        code: 'FORBIDDEN',
        message: `Unassign from ${formatList(policy.bayNames)} first`,
      });
    }),
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

function formatList(values: readonly string[]): string {
  if (values.length <= 1) {
    return values[0] ?? '';
  }

  return `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;
}
