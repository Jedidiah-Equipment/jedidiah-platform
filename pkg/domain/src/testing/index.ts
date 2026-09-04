import { type AppRole, ContractingRole, EquipmentRole, type UserAccessSummary } from '@pkg/schema';

import { createUserAccessSummary, type RoleSlots } from '../auth/authorization.js';

/** The slots a user holding exactly one role has; test fixtures build access from a single role. */
export function roleSlotsForRole(role: AppRole): RoleSlots {
  const equipmentRole = EquipmentRole.safeParse(role);

  return equipmentRole.success
    ? { contractingRole: null, equipmentRole: equipmentRole.data }
    : { contractingRole: ContractingRole.parse(role), equipmentRole: null };
}

export function accessForRole(role: AppRole, userId: string): UserAccessSummary {
  return createUserAccessSummary({ ...roleSlotsForRole(role), userId });
}
