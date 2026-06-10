import { canAssignUserRole } from '@pkg/core';
import type { Db } from '@pkg/db';
import { AppRole } from '@pkg/schema';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';

import { parseBetterAuthRole } from './session.js';

const SELF_ROLE_CHANGE_ERROR = {
  code: 'YOU_CANNOT_CHANGE_YOUR_OWN_ROLE',
  message: 'You cannot change your own role.',
} as const;

const LAST_ADMIN_ERROR = {
  code: 'YOU_CANNOT_REMOVE_THE_LAST_ADMIN',
  message: 'You cannot remove the last admin.',
} as const;

const OPEN_BAY_OPERATOR_ASSIGNMENTS_ERROR_CODE = 'USER_HAS_OPEN_BAY_OPERATOR_ASSIGNMENTS';

export function adminUserSafetyPlugin(database: Db): BetterAuthPlugin {
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

            const currentRole = parseBetterAuthRole(session.user.role);
            const nextRole = AppRole.parse(roleChange.role);

            if (session.user.id === roleChange.userId && currentRole !== nextRole) {
              throw APIError.from('FORBIDDEN', SELF_ROLE_CHANGE_ERROR);
            }

            const roleAssignmentPolicy = await canAssignUserRole({
              db: database,
              role: nextRole,
              userId: roleChange.userId,
            });

            if (!roleAssignmentPolicy.allowed) {
              if (roleAssignmentPolicy.reason === 'last-admin') {
                throw APIError.from('FORBIDDEN', LAST_ADMIN_ERROR);
              }

              throw APIError.from('FORBIDDEN', {
                code: OPEN_BAY_OPERATOR_ASSIGNMENTS_ERROR_CODE,
                message: `Unassign from ${formatList(roleAssignmentPolicy.bayNames)} first`,
              });
            }
          }),
        },
      ],
    },
  };
}

type RoleChangeInput = {
  role: string;
  userId: string;
};

function getRoleChangeInput(path: string | undefined, body: unknown): RoleChangeInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (path === '/admin/set-role' && typeof body.role === 'string' && typeof body.userId === 'string') {
    return {
      role: body.role,
      userId: body.userId,
    };
  }

  if (
    path === '/admin/update-user' &&
    typeof body.userId === 'string' &&
    isRecord(body.data) &&
    typeof body.data.role === 'string'
  ) {
    return {
      role: body.data.role,
      userId: body.userId,
    };
  }

  return null;
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
