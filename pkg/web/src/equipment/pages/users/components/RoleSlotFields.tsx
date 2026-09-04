import { CONTRACTING_ROLES, type ContractingRole, EQUIPMENT_ROLES, type EquipmentRole } from '@pkg/schema';

import { withFieldGroup } from '@/components/form/index.js';
import { RoleField } from './UserRoleField.js';

type RoleSlotFieldsProps = {
  disabled: boolean;
  equipmentRoleError?: string | null | undefined;
  onEquipmentRoleChange?: (() => void) | undefined;
};

// super-admin lives in the equipment slot and spans both businesses (ADR 0017), so choosing it
// empties and locks the contracting slot.
export const RoleSlotFields = withFieldGroup({
  defaultValues: { contractingRole: null as ContractingRole | null, equipmentRole: null as EquipmentRole | null },
  props: {} as RoleSlotFieldsProps,
  render: function RoleSlotFieldsGroup({ disabled, equipmentRoleError, group, onEquipmentRoleChange }) {
    return (
      <>
        <group.AppField name="equipmentRole">
          {(field) => (
            <RoleField
              disabled={disabled}
              errors={[...field.state.meta.errors, ...(equipmentRoleError ? [{ message: equipmentRoleError }] : [])]}
              label="Equipment role"
              name={field.name}
              onRoleChange={(role) => {
                onEquipmentRoleChange?.();
                field.handleChange(role);
                if (role === 'super-admin') group.setFieldValue('contractingRole', null);
              }}
              roles={EQUIPMENT_ROLES}
              value={field.state.value}
            />
          )}
        </group.AppField>
        <group.Subscribe selector={(state) => state.values.equipmentRole === 'super-admin'}>
          {(isSuperAdmin) => (
            <group.AppField name="contractingRole">
              {(field) => (
                <RoleField
                  disabled={disabled || isSuperAdmin}
                  errors={field.state.meta.errors}
                  label="Contracting role"
                  name={field.name}
                  onRoleChange={field.handleChange}
                  roles={CONTRACTING_ROLES}
                  value={field.state.value}
                />
              )}
            </group.AppField>
          )}
        </group.Subscribe>
      </>
    );
  },
});
