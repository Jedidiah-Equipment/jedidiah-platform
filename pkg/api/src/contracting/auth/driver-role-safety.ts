import { assertDriverAccountChangeAllowed, isFleetError } from '@pkg/core/contracting';
import type { Db } from '@pkg/db';
import { AuthId } from '@pkg/schema';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import { getRoleChange, spansBothBusinesses } from '../../auth/role-slots.js';

const AdminTarget = z.object({ userId: AuthId });
const DeviceUpdate = z.object({ isDevice: z.boolean().optional() });

// The database trigger remains the final concurrency guard; this is the friendly half.
export function driverRoleSafetyPlugin(db: Db): BetterAuthPlugin {
  return {
    id: 'contracting-driver-role-safety',
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
                try {
                  await assertDriverAccountChangeAllowed({
                    db,
                    userId: target.data.userId,
                    contractingRole: spansBothBusinesses(change?.equipmentRole) ? null : change?.contractingRole,
                    isDevice: device.data.isDevice,
                  });
                } catch (error) {
                  if (isFleetError(error))
                    throw APIError.from('FORBIDDEN', { code: error.code, message: error.message });
                  throw error;
                }
              },
            },
          },
        },
      },
    }),
  };
}
