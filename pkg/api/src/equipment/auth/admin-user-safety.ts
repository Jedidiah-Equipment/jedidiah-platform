import { canAssignUserRoleSlots } from '@pkg/core/equipment';
import type { Db } from '@pkg/db';
import { createUserAccessSummaryForUser, hasPermission, parseRoleSlots } from '@pkg/domain';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { changesSlots, getRoleChange } from '../../auth/role-slots.js';

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

const SUPER_ADMIN_SPANS_CONTRACTING_ERROR = {
  code: 'SUPER_ADMIN_SPANS_CONTRACTING',
  message: 'A super admin spans both businesses and cannot hold a separate contracting role.',
} as const;

/** Who may change which role slot; the slots themselves are mapped onto columns by the shared auth. */
export function adminUserSafetyPlugin(database: Db): BetterAuthPlugin {
  return {
    id: 'admin-user-safety',
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
            const actorAccess = createUserAccessSummaryForUser(session.user);
            if (!hasPermission(actorAccess, 'user:set-role') || actor.equipmentRole === null) {
              throw APIError.from('FORBIDDEN', ROLE_PERMISSION_ERROR);
            }

            if (change.userId === session.user.id && changesSlots(actor, change)) {
              throw APIError.from('FORBIDDEN', SELF_ROLE_CHANGE_ERROR);
            }

            const policy = await canAssignUserRoleSlots({
              ...change,
              actorRole: actor.equipmentRole,
              db: database,
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

function formatList(values: readonly string[]): string {
  if (values.length <= 1) {
    return values[0] ?? '';
  }

  return `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;
}
