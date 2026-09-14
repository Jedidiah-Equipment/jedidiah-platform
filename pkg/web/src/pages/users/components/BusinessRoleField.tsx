import { roleLabels } from '@pkg/domain';
import {
  type Business,
  CONTRACTING_ROLES,
  type ContractingRole,
  EQUIPMENT_ROLES,
  type EquipmentRole,
} from '@pkg/schema';

import { withFieldGroup } from '@/components/form/index.js';
import { RoleField } from './UserRoleField.js';

type BusinessRoleFieldProps = {
  business: Business;
  disabled: boolean;
  roleError?: string | null | undefined;
  onRoleChange?: (() => void) | undefined;
};

const roleSlotLabels = {
  contracting: 'Contracting role',
  equipment: 'Equipment role',
} as const satisfies Record<Business, string>;

/**
 * The one role slot user admin edits: the slot of the business it stands in. Holding a role in
 * both businesses is a scripted change, not one the app offers, so the other slot is never shown.
 * super-admin lives in the equipment slot and spans both (ADR 0017): in Contracting it reads as the
 * role and cannot be swapped out, since the equipment slot is what holds it.
 */
export const BusinessRoleField = withFieldGroup({
  defaultValues: { contractingRole: null as ContractingRole | null, equipmentRole: null as EquipmentRole | null },
  props: {} as BusinessRoleFieldProps,
  render: function BusinessRoleFieldGroup({ business, disabled, group, onRoleChange, roleError }) {
    if (business === 'equipment') {
      return (
        <group.AppField name="equipmentRole">
          {(field) => (
            <RoleField
              disabled={disabled}
              errors={[...field.state.meta.errors, ...(roleError ? [{ message: roleError }] : [])]}
              label={roleSlotLabels.equipment}
              name={field.name}
              onRoleChange={(role) => {
                onRoleChange?.();
                field.handleChange(role);
              }}
              roles={EQUIPMENT_ROLES}
              value={field.state.value}
            />
          )}
        </group.AppField>
      );
    }

    return (
      <group.Subscribe selector={(state) => state.values.equipmentRole === 'super-admin'}>
        {(isSuperAdmin) => (
          <group.AppField name="contractingRole">
            {(field) => (
              <RoleField
                description={isSuperAdmin ? `${roleLabels['super-admin']} spans both businesses.` : undefined}
                disabled={disabled || isSuperAdmin}
                errors={[...field.state.meta.errors, ...(roleError ? [{ message: roleError }] : [])]}
                label={roleSlotLabels.contracting}
                name={field.name}
                onRoleChange={(role) => {
                  onRoleChange?.();
                  field.handleChange(role);
                }}
                roles={CONTRACTING_ROLES}
                value={isSuperAdmin ? 'super-admin' : field.state.value}
              />
            )}
          </group.AppField>
        )}
      </group.Subscribe>
    );
  },
});
