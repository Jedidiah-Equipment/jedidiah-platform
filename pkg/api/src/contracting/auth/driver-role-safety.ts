import { assertDriverAccountChangeAllowed, isFleetError } from '@pkg/core/contracting';
import type { Db } from '@pkg/db';
import { AuthId, ContractingRole, EquipmentRole } from '@pkg/schema';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError } from 'better-auth/api';
import { z } from 'zod';

const RoleUpdate = z.object({
  contractingRole: ContractingRole.nullable().optional(),
  isDevice: z.boolean().optional(),
});
const AdminTarget = z.object({
  userId: AuthId,
  role: EquipmentRole.optional(),
  data: z.object({ equipmentRole: EquipmentRole.nullable().optional() }).optional(),
});

// Better Auth gives each hook the original update, so promotions must also be read from the
// transport fields: super-admin normalization clears the Contracting slot in another hook.
// The database trigger remains the final concurrency guard.
export function driverRoleSafetyPlugin(db: Db): BetterAuthPlugin {
  return {
    id: 'contracting-driver-role-safety',
    init: () => ({
      options: {
        databaseHooks: {
          user: {
            update: {
              before: async (updatedUser, context) => {
                const update = RoleUpdate.safeParse(updatedUser);
                const target = AdminTarget.safeParse(context?.body);
                if (!update.success || !target.success) return;
                const promotesSuperAdmin =
                  target.data.role === 'super-admin' || target.data.data?.equipmentRole === 'super-admin';
                const contractingRole = promotesSuperAdmin ? null : update.data.contractingRole;
                try {
                  await assertDriverAccountChangeAllowed({
                    db,
                    userId: target.data.userId,
                    contractingRole,
                    isDevice: update.data.isDevice,
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
