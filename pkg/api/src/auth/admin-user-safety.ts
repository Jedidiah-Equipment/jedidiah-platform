import { canAssignUserRole } from '@pkg/core';
import type { Database } from '@pkg/db';
import { AppRole } from '@pkg/schema';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';

const SELF_ROLE_CHANGE_ERROR = {
  code: 'YOU_CANNOT_CHANGE_YOUR_OWN_ROLE',
  message: 'You cannot change your own role.',
} as const;

const LAST_ADMIN_ERROR = {
  code: 'YOU_CANNOT_REMOVE_THE_LAST_ADMIN',
  message: 'You cannot remove the last admin.',
} as const;

export function adminUserSafetyPlugin(database: Database): BetterAuthPlugin {
  return {
    id: 'admin-user-safety',
    hooks: {
      before: [
        {
          matcher: ({ path }) => path === '/admin/set-role' || path === '/admin/update-user',
          handler: createAuthMiddleware(async (ctx) => {
            const roleChange = getRoleChangeInput(ctx.path, ctx.body);

            if (!roleChange) {
              return;
            }

            const session = await getSessionFromCtx(ctx);

            if (!session) {
              return;
            }

            const currentRoles = normalizeRoleList(session.user.role);
            const nextRoles = normalizeRoleList(roleChange.role);

            if (session.user.id === roleChange.userId && !sameRoleSet(currentRoles, nextRoles)) {
              throw APIError.from('FORBIDDEN', SELF_ROLE_CHANGE_ERROR);
            }

            const canAssignRole = await canAssignUserRole(database, {
              role: nextRoles,
              userId: roleChange.userId,
            });

            if (!canAssignRole) {
              throw APIError.from('FORBIDDEN', LAST_ADMIN_ERROR);
            }
          }),
        },
      ],
    },
  };
}

type RoleChangeInput = {
  role: string | string[];
  userId: string;
};

function getRoleChangeInput(path: string | undefined, body: unknown): RoleChangeInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (path === '/admin/set-role' && isRoleValue(body.role) && typeof body.userId === 'string') {
    return {
      role: body.role,
      userId: body.userId,
    };
  }

  if (
    path === '/admin/update-user' &&
    typeof body.userId === 'string' &&
    isRecord(body.data) &&
    isRoleValue(body.data.role)
  ) {
    return {
      role: body.data.role,
      userId: body.userId,
    };
  }

  return null;
}

function normalizeRoleList(role: unknown): AppRole[] {
  const rawRoles = Array.isArray(role) ? role : typeof role === 'string' ? role.split(',') : [];

  return rawRoles
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is AppRole => AppRole.safeParse(value).success);
}

function sameRoleSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  return leftSet.size === rightSet.size && [...leftSet].every((role) => rightSet.has(role));
}

function isRoleValue(value: unknown): value is string | string[] {
  return typeof value === 'string' || (Array.isArray(value) && value.every(isString));
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
