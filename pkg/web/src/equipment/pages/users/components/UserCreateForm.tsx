import { CONTRACTING_ROLES, ContractingRole, EQUIPMENT_ROLES, EquipmentRole, UserPassword } from '@pkg/schema';
import { UserSummary } from '@pkg/schema/equipment';
import type React from 'react';
import type { z } from 'zod';

import { useAppForm } from '@/components/form/index.js';
import { FieldGroup } from '@/components/ui/field.js';
import { UserDepartmentsForm } from './UserDepartmentsForm.js';
import { SubmitFooter } from './UserFormFooter.js';
import { RoleField } from './UserRoleField.js';

export type UserCreateFormValues = z.infer<typeof UserCreateFormValues>;
export const UserCreateFormValues = UserSummary.omit({
  assistantEnabled: true,
  id: true,
  thumbnailDataUrl: true,
}).extend({
  password: UserPassword,
});

type UserCreateFormProps = {
  canAssignDepartments: boolean;
  canSetRole: boolean;
  isPending: boolean;
  onSubmit: (value: UserCreateFormValues) => Promise<unknown>;
};

export const UserCreateForm: React.FC<UserCreateFormProps> = ({
  canAssignDepartments,
  canSetRole,
  isPending,
  onSubmit,
}) => {
  const defaultValues: UserCreateFormValues = {
    departments: [],
    email: '',
    emailVerified: true,
    isDevice: false,
    name: '',
    password: '',
    phoneNumber: null,
    contractingRole: null,
    equipmentRole: 'sales',
  };
  const form = useAppForm({
    defaultValues,
    validators: {
      onSubmit: UserCreateFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.AppField name="name">
          {(field) => <field.TextField autoComplete="name" label="Full Name" />}
        </form.AppField>
        <form.AppField name="email">
          {(field) => <field.TextField autoComplete="email" label="Email" type="email" />}
        </form.AppField>
        <form.AppField name="phoneNumber">{(field) => <field.PhoneNumberField label="Phone number" />}</form.AppField>
        {canSetRole ? (
          <form.AppField name="isDevice">
            {(field) => (
              <field.CheckboxField
                description="A tablet or terminal several people share. It signs in as itself, then names whoever is standing at it before any stock moves — so it is never the person a movement is recorded against, and has no badge card of its own."
                disabled={isPending}
                label="Shared device"
              />
            )}
          </form.AppField>
        ) : null}
        <form.AppField name="equipmentRole">
          {(field) => (
            <RoleField
              disabled={isPending}
              errors={field.state.meta.errors}
              label="Equipment role"
              name={field.name}
              onRoleChange={(role) => {
                const equipmentRole = EquipmentRole.nullable().parse(role);
                field.handleChange(equipmentRole);
                if (equipmentRole === 'super-admin') form.setFieldValue('contractingRole', null);
              }}
              roles={EQUIPMENT_ROLES}
              value={field.state.value}
            />
          )}
        </form.AppField>
        <form.AppField name="contractingRole">
          {(field) => (
            <RoleField
              disabled={isPending || form.state.values.equipmentRole === 'super-admin'}
              errors={field.state.meta.errors}
              label="Contracting role"
              name={field.name}
              onRoleChange={(role) => field.handleChange(ContractingRole.nullable().parse(role))}
              roles={CONTRACTING_ROLES}
              value={field.state.value}
            />
          )}
        </form.AppField>
        {canAssignDepartments ? (
          <form.AppField name="departments">
            {(field) => (
              <UserDepartmentsForm
                initialDepartments={field.state.value}
                isPending={isPending}
                onDepartmentsChange={(departments) => field.handleChange([...departments])}
              />
            )}
          </form.AppField>
        ) : null}
        <form.AppField name="emailVerified">{(field) => <field.CheckboxField label="Email verified" />}</form.AppField>
        <form.AppField name="password">
          {(field) => <field.PasswordField autoComplete="new-password" label="Password" />}
        </form.AppField>
      </FieldGroup>
      <SubmitFooter isPending={isPending} label="Create user" />
    </form>
  );
};
