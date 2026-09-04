import type { ContractingRole, EquipmentRole } from '@pkg/schema';

type EditableRoleSlots = {
  contractingRole: ContractingRole | null;
  equipmentRole: EquipmentRole | null;
};

export type UserRoleUpdateData = {
  contractingRole?: ContractingRole | null;
  equipmentRole?: null;
  role?: EquipmentRole;
};

export function buildUserRoleUpdateData({
  baseline,
  value,
}: {
  baseline: EditableRoleSlots;
  value: EditableRoleSlots;
}): UserRoleUpdateData {
  const data: UserRoleUpdateData = {};

  if (value.equipmentRole !== baseline.equipmentRole) {
    // Better Auth rejects null in `role`; its database hook recognizes `equipmentRole` as the clear marker.
    if (value.equipmentRole === null) {
      data.equipmentRole = null;
    } else {
      data.role = value.equipmentRole;
    }
  }

  if (value.equipmentRole === 'super-admin') {
    if (baseline.equipmentRole !== 'super-admin') {
      data.contractingRole = null;
    }
  } else {
    // A projected super-admin value is not a persisted Contracting role when the spanning role is removed.
    const contractingRole = value.contractingRole === 'super-admin' ? null : value.contractingRole;
    if (contractingRole !== baseline.contractingRole) {
      data.contractingRole = contractingRole;
    }
  }

  return data;
}
