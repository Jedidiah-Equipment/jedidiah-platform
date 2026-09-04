import {
  CONTRACTING_ROLES,
  ContractingRole,
  EQUIPMENT_ROLES,
  EquipmentRole,
  UserSummary,
  type UserSummary as UserSummaryType,
} from '@pkg/schema';
import type React from 'react';
import type { z } from 'zod';

import { useAppForm } from '@/components/form/index.js';
import { FieldGroup } from '@/components/ui/field.js';
import { Separator } from '@/components/ui/separator.js';
import { UserDepartmentsForm } from './UserDepartmentsForm.js';
import { UserPasswordForm, type UserPasswordFormValues } from './UserPasswordForm.js';
import { RoleField } from './UserRoleField.js';

export type UserEditFormValues = z.infer<typeof UserEditFormValues>;
export const UserEditFormValues = UserSummary.pick({
  assistantEnabled: true,
  departments: true,
  email: true,
  emailVerified: true,
  isDevice: true,
  name: true,
  phoneNumber: true,
  contractingRole: true,
  equipmentRole: true,
  thumbnailDataUrl: true,
});

type UserEditFormProps = {
  canAssignDepartments: boolean;
  canSetEmail: boolean;
  canSetPassword: boolean;
  canSetRole: boolean;
  canUpdateProfile: boolean;
  formId: string;
  initialUser: UserSummaryType;
  isPending: boolean;
  isPasswordPending: boolean;
  onPasswordSubmit: (value: UserPasswordFormValues) => Promise<unknown>;
  onRoleChange?: () => void;
  onSubmit: (value: UserEditFormValues) => Promise<unknown>;
  roleError?: string | null;
};

export const UserEditForm: React.FC<UserEditFormProps> = ({
  canAssignDepartments,
  canSetEmail,
  canSetPassword,
  canSetRole,
  canUpdateProfile,
  formId,
  initialUser,
  isPending,
  isPasswordPending,
  onPasswordSubmit,
  onRoleChange,
  onSubmit,
  roleError,
}) => {
  const canSaveUser = canUpdateProfile || canSetEmail || canSetRole || canAssignDepartments;
  const form = useAppForm({
    defaultValues: {
      assistantEnabled: initialUser.assistantEnabled,
      departments: initialUser.departments,
      email: initialUser.email,
      emailVerified: initialUser.emailVerified,
      name: initialUser.name,
      phoneNumber: initialUser.phoneNumber,
      isDevice: initialUser.isDevice,
      contractingRole: initialUser.contractingRole,
      equipmentRole: initialUser.equipmentRole,
      thumbnailDataUrl: initialUser.thumbnailDataUrl,
    } satisfies UserEditFormValues,
    validators: {
      onSubmit: UserEditFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
      form.reset(value);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {canSaveUser ? (
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            {canUpdateProfile ? (
              <>
                <form.AppField name="name">
                  {(field) => <field.TextField autoComplete="name" disabled={isPending} label="Full Name" />}
                </form.AppField>
                <form.AppField name="thumbnailDataUrl">
                  {(field) => (
                    <field.ThumbnailField
                      disabled={isPending}
                      fallbackLabel={form.state.values.name || form.state.values.email}
                      label="Thumbnail"
                    />
                  )}
                </form.AppField>
                <form.AppField name="phoneNumber">
                  {(field) => <field.PhoneNumberField disabled={isPending} label="Phone number" />}
                </form.AppField>
                <form.AppField name="assistantEnabled">
                  {(field) => <field.CheckboxField disabled={isPending} label="Assistant enabled" />}
                </form.AppField>
              </>
            ) : null}
            {canSetEmail ? (
              <>
                <form.AppField name="email">
                  {(field) => <field.TextField autoComplete="email" disabled={isPending} label="Email" type="email" />}
                </form.AppField>
                <form.AppField name="emailVerified">
                  {(field) => <field.CheckboxField disabled={isPending} label="Email verified" />}
                </form.AppField>
              </>
            ) : null}
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
            {canSetRole ? (
              <form.AppField name="equipmentRole">
                {(field) => (
                  <RoleField
                    disabled={isPending}
                    errors={[...field.state.meta.errors, ...(roleError ? [{ message: roleError }] : [])]}
                    label="Equipment role"
                    name={field.name}
                    onRoleChange={(role) => {
                      onRoleChange?.();
                      const equipmentRole = EquipmentRole.nullable().parse(role);
                      const wasSuperAdmin = form.state.values.equipmentRole === 'super-admin';
                      field.handleChange(equipmentRole);
                      if (wasSuperAdmin && equipmentRole !== 'super-admin') {
                        form.setFieldValue('contractingRole', null);
                      }
                    }}
                    roles={EQUIPMENT_ROLES}
                    value={field.state.value}
                  />
                )}
              </form.AppField>
            ) : null}
            {canSetRole ? (
              <form.AppField name="contractingRole">
                {(field) => (
                  <RoleField
                    disabled={isPending || form.state.values.equipmentRole === 'super-admin'}
                    errors={field.state.meta.errors}
                    label="Contracting role"
                    name={field.name}
                    onRoleChange={(role) => field.handleChange(ContractingRole.nullable().parse(role))}
                    roles={CONTRACTING_ROLES.filter((role) => role !== 'super-admin')}
                    value={field.state.value}
                  />
                )}
              </form.AppField>
            ) : null}
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
          </FieldGroup>
        </form>
      ) : null}
      {canSetPassword ? (
        <>
          {canSaveUser ? <Separator /> : null}
          <UserPasswordForm isPending={isPasswordPending} onSubmit={onPasswordSubmit} />
        </>
      ) : null}
    </div>
  );
};
