import {
  getUserAuditRow,
  getUserRemovalVerdict,
  recordUserDisabledChange,
  recordUserRemoval,
  type UserAuditRow,
} from '@pkg/core';
import type { Db } from '@pkg/db';
import { createUserAccessSummaryForUser, hasPermission, parseRoleSlots } from '@pkg/domain';
import { AuthId, type EquipmentRole } from '@pkg/schema';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { z } from 'zod';

const USER_HAS_HISTORY_ERROR = {
  code: 'USER_HAS_HISTORY',
  message: 'This person has history. Disable them instead.',
} as const;

// Disable and Remove both take a User out of every role; Enable only reverses Disable.
const leavingPermissions = {
  '/admin/ban-user': 'user:ban',
  '/admin/remove-user': 'user:delete',
} as const;
const accountPermissions = { ...leavingPermissions, '/admin/unban-user': 'user:ban' } as const;

type AccountPath = keyof typeof accountPermissions;

/** Disable or Remove: the paths that run every business's leaving gate. */
export const isLeavingPath = (path: string | undefined) =>
  path !== undefined && Object.hasOwn(leavingPermissions, path);
const isAccountPath = (path: string | undefined): path is AccountPath =>
  path !== undefined && Object.hasOwn(accountPermissions, path);

const AdminTarget = z.object({ userId: AuthId });

type AccountChangeRequest = { actorUserId: AuthId; actorRole: EquipmentRole; userId: AuthId };

/**
 * The actor and target of a Disable, Enable or Remove, or null when better-auth should refuse the call itself: no
 * session, no `user:ban` / `user:delete`, no Equipment role, or the actor's own account. Every before-hook on these
 * paths starts here, so no gate message reaches a caller who may not make the change.
 */
export async function readAccountChangeRequest(
  ctx: Parameters<typeof getSessionFromCtx>[0],
): Promise<AccountChangeRequest | null> {
  if (!isAccountPath(ctx.path)) return null;
  const target = AdminTarget.safeParse(ctx.body);
  const session = await getSessionFromCtx(ctx);
  if (!target.success || !session || target.data.userId === session.user.id) return null;

  const actorRole = parseRoleSlots(session.user).equipmentRole;
  const access = createUserAccessSummaryForUser(session.user);
  if (actorRole === null || !hasPermission(access, accountPermissions[ctx.path])) return null;

  return { actorUserId: AuthId.parse(session.user.id), actorRole, userId: target.data.userId };
}

type PendingAudit = { actorUserId: AuthId; before: UserAuditRow };

/**
 * Remove refuses a User with history, and Disable, Enable and Remove are audited. Registered after the business
 * plugins, so a leaving gate's actionable sentence wins over "Disable them instead".
 */
export function userRemovalPlugin(db: Db): BetterAuthPlugin {
  // Keyed by the per-call auth context, the one object the before- and after-hooks of a call share.
  const pending = new WeakMap<object, PendingAudit>();

  return {
    id: 'user-removal',
    hooks: {
      before: [
        {
          matcher: ({ path }) => isAccountPath(path),
          handler: createAuthMiddleware(async (ctx) => {
            const request = await readAccountChangeRequest(ctx);
            if (!request) return;

            if (ctx.path === '/admin/remove-user') {
              const { hasHistory } = await getUserRemovalVerdict({ db, userId: request.userId });
              if (hasHistory) throw APIError.from('FORBIDDEN', USER_HAS_HISTORY_ERROR);
            }

            // Removal deletes the row, so the audit event is built from the row as it stands now.
            const before = await getUserAuditRow({ db, userId: request.userId });
            if (before) pending.set(ctx.context, { actorUserId: request.actorUserId, before });
          }),
        },
      ],
      after: [
        {
          matcher: ({ path }) => isAccountPath(path),
          handler: createAuthMiddleware(async (ctx) => {
            const audit = pending.get(ctx.context);
            pending.delete(ctx.context);
            // After-hooks run when the endpoint refused too; a refusal changed nothing to audit.
            if (!audit || isAPIError(ctx.context.returned)) return;

            if (ctx.path === '/admin/remove-user') {
              await recordUserRemoval({ db, actorUserId: audit.actorUserId, removed: audit.before });
            } else {
              await recordUserDisabledChange({ db, actorUserId: audit.actorUserId, before: audit.before });
            }
          }),
        },
      ],
    },
  };
}
