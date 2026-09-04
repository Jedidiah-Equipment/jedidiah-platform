import { canAssignUserRoleSlots, isContractingRoleBesideSuperAdmin, isReservedSuperAdminAssignment } from '@pkg/core';
import type { Db } from '@pkg/db';
import { createUserAccessSummary, hasPermission, parseRoleSlots, type RoleSlots } from '@pkg/domain';
import { ContractingRole, EquipmentRole } from '@pkg/schema';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import type { z } from 'zod';

const SELF_ROLE_CHANGE_ERROR = {
  code: 'YOU_CANNOT_CHANGE_YOUR_OWN_ROLE',
  message: 'You cannot change your own role.',
} as const;

const LAST_ADMIN_ERROR = {
  code: 'YOU_CANNOT_REMOVE_THE_LAST_ADMIN',
  message: 'You cannot remove the last admin.',
} as const;

const OPEN_BAY_OPERATOR_ASSIGNMENTS_ERROR_CODE = 'USER_HAS_OPEN_BAY_OPERATOR_ASSIGNMENTS';

const RESERVED_SUPER_ADMIN_ERROR = {
  code: 'ONLY_SUPER_ADMIN_CAN_ASSIGN_SUPER_ADMIN',
  message: 'Only a super admin can assign or remove the super admin role.',
} as const;

const ROLE_PERMISSION_ERROR = {
  code: 'ROLE_PERMISSION_REQUIRED',
  message: 'You do not have permission to change user roles.',
} as const;

const INVALID_ROLE_ERROR = {
  code: 'INVALID_ROLE',
  message: 'The requested role is invalid.',
} as const;

const SUPER_ADMIN_SPANS_CONTRACTING_ERROR = {
  code: 'SUPER_ADMIN_SPANS_CONTRACTING',
  message: 'A super admin spans both businesses and cannot hold a separate contracting role.',
} as const;

const ROLE_SPELLING_ERROR = {
  code: 'INVALID_ROLE',
  message: 'Send the equipment role as `data.equipmentRole`.',
} as const;

/**
 * Role slots travel as `data.equipmentRole` and `data.contractingRole` on create-user and
 * update-user (Better Auth's own `role` cannot carry null), and as `role` on set-role, which is
 * Better Auth's native single-slot endpoint. The database hook below maps `equipmentRole` onto the
 * `role` column Better Auth owns and clears the contracting slot whenever super-admin lands.
 */
export function adminUserSafetyPlugin(database: Db): BetterAuthPlugin {
  return {
    id: 'admin-user-safety',
    init: () => ({
      options: {
        databaseHooks: {
          user: {
            create: {
              before: (createdUser, context) => applyRoleSlots(createdUser, context?.path, context?.body),
            },
            update: {
              before: (updatedUser, context) => applyRoleSlots(updatedUser, context?.path, context?.body),
            },
          },
        },
      },
    }),
    hooks: {
      before: [
        {
          matcher: ({ path }) =>
            path === '/admin/create-user' || path === '/admin/set-role' || path === '/admin/update-user',
          handler: createAuthMiddleware(async (ctx) => {
            const change = getRoleChange(ctx.path, ctx.body);

            if (!change) {
              return;
            }

            const session = await getSessionFromCtx(ctx);

            if (!session) {
              return;
            }

            const actor = parseRoleSlots(session.user);
            const actorAccess = createUserAccessSummary({ ...actor, userId: session.user.id });
            if (!hasPermission(actorAccess, 'user:set-role') || actor.equipmentRole === null) {
              throw APIError.from('FORBIDDEN', ROLE_PERMISSION_ERROR);
            }

            if (change.userId === session.user.id && changesSlots(actor, change)) {
              throw APIError.from('FORBIDDEN', SELF_ROLE_CHANGE_ERROR);
            }

            if (isContractingRoleBesideSuperAdmin(change)) {
              throw APIError.from('BAD_REQUEST', SUPER_ADMIN_SPANS_CONTRACTING_ERROR);
            }

            if (!change.userId) {
              // Create-user has no existing user to look up, so only the reserved-role rule applies.
              if (
                isReservedSuperAdminAssignment({
                  actorRole: actor.equipmentRole,
                  targetRole: change.equipmentRole ?? null,
                })
              ) {
                throw APIError.from('FORBIDDEN', RESERVED_SUPER_ADMIN_ERROR);
              }
              return;
            }

            const { userId, ...slots } = change;
            const policy = await canAssignUserRoleSlots({
              ...slots,
              actorRole: actor.equipmentRole,
              db: database,
              userId,
            });

            if (policy.allowed) {
              return;
            }

            if (policy.reason === 'last-admin') {
              throw APIError.from('FORBIDDEN', LAST_ADMIN_ERROR);
            }

            if (policy.reason === 'reserved-super-admin') {
              throw APIError.from('FORBIDDEN', RESERVED_SUPER_ADMIN_ERROR);
            }

            if (policy.reason === 'super-admin-spans-contracting') {
              throw APIError.from('BAD_REQUEST', SUPER_ADMIN_SPANS_CONTRACTING_ERROR);
            }

            throw APIError.from('FORBIDDEN', {
              code: OPEN_BAY_OPERATOR_ASSIGNMENTS_ERROR_CODE,
              message: `Unassign from ${formatList(policy.bayNames)} first`,
            });
          }),
        },
      ],
    },
  };
}

// A slot left out is a slot left untouched.
type RoleChange = Partial<RoleSlots> & { userId?: string };

function changesSlots(current: RoleSlots, change: RoleChange): boolean {
  return (
    (change.equipmentRole !== undefined && change.equipmentRole !== current.equipmentRole) ||
    (change.contractingRole !== undefined && change.contractingRole !== current.contractingRole)
  );
}

function getRoleChange(path: string | undefined, body: unknown): RoleChange | null {
  if (!isRecord(body)) {
    return null;
  }

  if (path === '/admin/set-role') {
    return typeof body.userId === 'string'
      ? { equipmentRole: parseSlot(EquipmentRole, body.role), userId: body.userId }
      : null;
  }

  if (path !== '/admin/create-user' && path !== '/admin/update-user') {
    return null;
  }

  const data = isRecord(body.data) ? body.data : {};
  if (Object.hasOwn(body, 'role') || Object.hasOwn(data, 'role')) {
    throw APIError.from('BAD_REQUEST', ROLE_SPELLING_ERROR);
  }

  const change: RoleChange = {
    ...(Object.hasOwn(data, 'equipmentRole') ? { equipmentRole: parseSlot(EquipmentRole, data.equipmentRole) } : {}),
    ...(Object.hasOwn(data, 'contractingRole')
      ? { contractingRole: parseSlot(ContractingRole, data.contractingRole) }
      : {}),
    ...(typeof body.userId === 'string' ? { userId: body.userId } : {}),
  };

  return change.equipmentRole === undefined && change.contractingRole === undefined ? null : change;
}

function parseSlot<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const result = schema.nullable().safeParse(value);
  if (!result.success) throw APIError.from('BAD_REQUEST', INVALID_ROLE_ERROR);
  return result.data;
}

// Better Auth inserts its own `role` default on create-user, so an omitted equipment role must be
// written as null rather than left to that default. Set-role writes `role` itself; it is included
// so super-admin clears the contracting slot on that path too.
async function applyRoleSlots<T extends Record<string, unknown>>(userData: T, path: string | undefined, body: unknown) {
  const data = isRecord(body) && isRecord(body.data) ? body.data : {};
  const carriesEquipmentRole =
    path === '/admin/create-user' || (path === '/admin/update-user' && Object.hasOwn(data, 'equipmentRole'));

  if (!carriesEquipmentRole && !(path === '/admin/set-role' && Object.hasOwn(userData, 'role'))) {
    return;
  }

  const { equipmentRole: _transportField, ...persistedUser } = userData;
  const role = carriesEquipmentRole ? (data.equipmentRole ?? null) : userData.role;

  return {
    data: {
      ...persistedUser,
      role,
      ...(role === 'super-admin' ? { contractingRole: null } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatList(values: readonly string[]): string {
  if (values.length <= 1) {
    return values[0] ?? '';
  }

  return `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;
}
