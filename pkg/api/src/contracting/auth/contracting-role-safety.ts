import { assertContractingAccountChangeAllowed, isContractingAccountChangeRefusal } from '@pkg/core/contracting';
import type { Db } from '@pkg/db';
import { AuthId } from '@pkg/schema';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { z } from 'zod';
import { getRoleChange, spansBothBusinesses } from '../../auth/role-slots.js';
import { isLeavingPath, readAccountChangeRequest } from '../../auth/user-removal.js';

const AdminTarget = z.object({ userId: AuthId });
const DeviceUpdate = z.object({ isDevice: z.boolean().optional() });

// The database trigger remains the final concurrency guard; this is the friendly half.
export function contractingRoleSafetyPlugin(db: Db): BetterAuthPlugin {
  return {
    id: 'contracting-role-safety',
    init: () => ({
      options: {
        databaseHooks: {
          user: {
            update: {
              before: async (updatedUser, context) => {
                const target = AdminTarget.safeParse(context?.body);
                const device = DeviceUpdate.safeParse(updatedUser);
                if (!target.success || !device.success) return;
                const change = getRoleChange(context?.path, context?.body);
                await refuseStrandedWork({
                  db,
                  userId: target.data.userId,
                  contractingRole: spansBothBusinesses(change?.equipmentRole) ? null : change?.contractingRole,
                  isDevice: device.data.isDevice,
                });
              },
            },
          },
        },
      },
    }),
    hooks: {
      before: [
        {
          // Disable and Remove run before better-auth writes anything; a database hook would half-apply a Remove.
          matcher: ({ path }) => isLeavingPath(path),
          handler: createAuthMiddleware(async (ctx) => {
            const request = await readAccountChangeRequest(ctx);
            if (!request) return;
            await refuseStrandedWork({ db, userId: request.userId, contractingRole: null, leaving: true });
          }),
        },
      ],
    },
  };
}

async function refuseStrandedWork(change: Parameters<typeof assertContractingAccountChangeAllowed>[0]) {
  try {
    await assertContractingAccountChangeAllowed(change);
  } catch (error) {
    if (isContractingAccountChangeRefusal(error))
      throw APIError.from('FORBIDDEN', { code: error.code, message: error.message });
    throw error;
  }
}
