import { canAssignUserRoleSlots, isReservedSuperAdminAssignment } from '@pkg/core';
import type { Db } from '@pkg/db';
import { createUserAccessSummary, hasPermission } from '@pkg/domain';
import { ContractingRole, EquipmentRole } from '@pkg/schema';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';

import { parseBetterAuthRoleSlots } from '../../auth/sign-in-eligibility.js';

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

export function adminUserSafetyPlugin(database: Db): BetterAuthPlugin {
  return {
    id: 'admin-user-safety',
    init: () => ({
      options: {
        databaseHooks: {
          user: {
            create: {
              before: (createdUser, context) => applyNullableEquipmentRole(createdUser, context?.path, context?.body),
            },
            update: {
              before: (updatedUser, context) => applyNullableEquipmentRole(updatedUser, context?.path, context?.body),
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
            const roleChange = getRoleChangeInput(ctx.path, ctx.body);

            if (!roleChange) {
              return;
            }

            const session = await getSessionFromCtx(ctx);

            if (!session) {
              return;
            }

            const currentRoles = parseBetterAuthRoleSlots({
              contractingRole: (session.user as Record<string, unknown>).contractingRole,
              role: (session.user as Record<string, unknown>).role,
            });
            const actorAccess = createUserAccessSummary({ ...currentRoles, userId: session.user.id });
            if (!hasPermission(actorAccess, 'user:set-role') || currentRoles.equipmentRole === null) {
              throw APIError.from('FORBIDDEN', ROLE_PERMISSION_ERROR);
            }

            const actorEquipmentRole = currentRoles.equipmentRole;
            const nextEquipmentRole = roleChange.hasEquipmentRole
              ? parseEquipmentRole(roleChange.equipmentRole)
              : undefined;
            const nextContractingRole = roleChange.hasContractingRole
              ? parseContractingRole(roleChange.contractingRole)
              : undefined;

            if (
              roleChange.userId &&
              session.user.id === roleChange.userId &&
              ((roleChange.hasEquipmentRole && currentRoles.equipmentRole !== nextEquipmentRole) ||
                (roleChange.hasContractingRole && currentRoles.contractingRole !== nextContractingRole))
            ) {
              throw APIError.from('FORBIDDEN', SELF_ROLE_CHANGE_ERROR);
            }

            if (nextContractingRole === 'super-admin') {
              // Super-admin is represented by the equipment slot and projected into both businesses.
              // Persisting it in Contracting would create a second, competing source of truth.
              throw APIError.from('FORBIDDEN', RESERVED_SUPER_ADMIN_ERROR);
            }

            if (roleChange.hasEquipmentRole && nextEquipmentRole !== undefined && !roleChange.userId) {
              // Create-user has no existing user to look up, so the reserved-role rule is checked
              // directly here; modifications route through the shared core policy below.
              if (
                isReservedSuperAdminAssignment({
                  actorRole: actorEquipmentRole,
                  targetRole: nextEquipmentRole,
                })
              ) {
                throw APIError.from('FORBIDDEN', RESERVED_SUPER_ADMIN_ERROR);
              }
            }

            if (roleChange.userId) {
              const roleAssignmentPolicy = await canAssignUserRoleSlots({
                actorRole: actorEquipmentRole,
                db: database,
                ...(nextContractingRole !== undefined ? { contractingRole: nextContractingRole } : {}),
                ...(nextEquipmentRole !== undefined ? { equipmentRole: nextEquipmentRole } : {}),
                userId: roleChange.userId,
              });

              if (!roleAssignmentPolicy.allowed) {
                if (roleAssignmentPolicy.reason === 'last-admin') {
                  throw APIError.from('FORBIDDEN', LAST_ADMIN_ERROR);
                }

                if (roleAssignmentPolicy.reason === 'reserved-super-admin') {
                  throw APIError.from('FORBIDDEN', RESERVED_SUPER_ADMIN_ERROR);
                }

                throw APIError.from('FORBIDDEN', {
                  code: OPEN_BAY_OPERATOR_ASSIGNMENTS_ERROR_CODE,
                  message: `Unassign from ${formatList(roleAssignmentPolicy.bayNames)} first`,
                });
              }
            }
          }),
        },
      ],
    },
  };
}

type RoleChangeInput = {
  contractingRole: string | null | undefined;
  equipmentRole: string | null | undefined;
  hasContractingRole: boolean;
  hasEquipmentRole: boolean;
  userId?: string;
};

function getRoleChangeInput(path: string | undefined, body: unknown): RoleChangeInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (path === '/admin/set-role' && typeof body.role === 'string' && typeof body.userId === 'string') {
    return {
      contractingRole: undefined,
      equipmentRole: body.role,
      hasContractingRole: false,
      hasEquipmentRole: true,
      userId: body.userId,
    };
  }

  if (path === '/admin/create-user') {
    const data = isRecord(body.data) ? body.data : {};
    const hasEquipmentRole =
      hasNullableString(data, 'equipmentRole') || hasNullableString(body, 'role') || hasNullableString(data, 'role');
    const hasContractingRole = hasNullableString(data, 'contractingRole');

    if (hasEquipmentRole || hasContractingRole) {
      return {
        contractingRole: hasContractingRole ? (data.contractingRole as string | null) : undefined,
        equipmentRole: hasNullableString(data, 'equipmentRole')
          ? (data.equipmentRole as string | null)
          : hasNullableString(data, 'role')
            ? (data.role as string | null)
            : (body.role as string | null),
        hasContractingRole,
        hasEquipmentRole,
      };
    }
  }

  if (path === '/admin/update-user' && typeof body.userId === 'string' && isRecord(body.data)) {
    const hasEquipmentRole = hasNullableString(body.data, 'equipmentRole') || hasNullableString(body.data, 'role');
    const hasContractingRole = hasNullableString(body.data, 'contractingRole');

    if (hasEquipmentRole || hasContractingRole) {
      return {
        contractingRole: hasContractingRole ? (body.data.contractingRole as string | null) : undefined,
        equipmentRole: hasNullableString(body.data, 'equipmentRole')
          ? (body.data.equipmentRole as string | null)
          : hasEquipmentRole
            ? (body.data.role as string | null)
            : undefined,
        hasContractingRole,
        hasEquipmentRole,
        userId: body.userId,
      };
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasNullableString(record: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(record, key) && (typeof record[key] === 'string' || record[key] === null);
}

function parseEquipmentRole(value: string | null | undefined) {
  const result = EquipmentRole.nullable().safeParse(value);
  if (!result.success) throw APIError.from('BAD_REQUEST', INVALID_ROLE_ERROR);
  return result.data;
}

function parseContractingRole(value: string | null | undefined) {
  const result = ContractingRole.nullable().safeParse(value);
  if (!result.success) throw APIError.from('BAD_REQUEST', INVALID_ROLE_ERROR);
  return result.data;
}

async function applyNullableEquipmentRole<T extends Record<string, unknown>>(
  userData: T,
  path: string | undefined,
  body: unknown,
) {
  if (
    (path !== '/admin/create-user' && path !== '/admin/update-user') ||
    !isRecord(body) ||
    !isRecord(body.data) ||
    !hasNullableString(body.data, 'equipmentRole')
  ) {
    return;
  }

  const { equipmentRole: _transportField, ...persistedUser } = userData;

  return {
    data: {
      ...persistedUser,
      role: body.data.equipmentRole,
    },
  };
}

function formatList(values: readonly string[]): string {
  if (values.length <= 1) {
    return values[0] ?? '';
  }

  return `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;
}
