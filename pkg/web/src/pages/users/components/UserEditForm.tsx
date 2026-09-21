import { type Business, UserAccount, type UserAccount as UserAccountType } from '@pkg/schema';
import type React from 'react';
import type { z } from 'zod';

import { useAppForm } from '@/components/form/index.js';
import { FieldGroup } from '@/components/ui/field.js';
import { Separator } from '@/components/ui/separator.js';
import { BusinessRoleField } from './BusinessRoleField.js';
import { UserPasswordForm, type UserPasswordFormValues } from './UserPasswordForm.js';

export type UserEditFormValues = z.infer<typeof UserEditFormValues>;
export const UserEditFormValues = UserAccount.pick({
  assistantEnabled: true,
  email: true,
  emailVerified: true,
  isDevice: true,
  name: true,
  phoneNumber: true,
  quoteSalesperson: true,
  contractingRole: true,
  equipmentRole: true,
  thumbnailDataUrl: true,
});

type UserEditFormProps = {
  business: Business;
  canSetEmail: boolean;
  canSetPassword: boolean;
  canSetRole: boolean;
  canUpdateProfile: boolean;
  /** The business's own fields, rendered after the role. */
  extraFields: React.ReactNode;
  formId: string;
  initialUser: UserAccountType;
  isPending: boolean;
  isPasswordPending: boolean;
  onPasswordSubmit: (value: UserPasswordFormValues) => Promise<unknown>;
  onRoleChange?: () => void;
  onSubmit: (value: UserEditFormValues) => Promise<unknown>;
  roleError?: string | null;
};

export const UserEditForm: React.FC<UserEditFormProps> = ({
  business,
  canSetEmail,
  canSetPassword,
  canSetRole,
  canUpdateProfile,
  extraFields,
  formId,
  initialUser,
  isPending,
  isPasswordPending,
  onPasswordSubmit,
  onRoleChange,
  onSubmit,
  roleError,
}) => {
  const canSaveUser = canUpdateProfile || canSetEmail || canSetRole;
  const form = useAppForm({
    defaultValues: {
      assistantEnabled: initialUser.assistantEnabled,
      email: initialUser.email,
      emailVerified: initialUser.emailVerified,
      name: initialUser.name,
      phoneNumber: initialUser.phoneNumber,
      quoteSalesperson: initialUser.quoteSalesperson,
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
                {business === 'equipment' ? (
                  <form.AppField name="quoteSalesperson">
                    {(field) => (
                      <field.CheckboxField
                        description="Lists this person in the Salesperson picker on Quotes. It changes nothing about what they can see or do."
                        disabled={isPending}
                        label="Quote salesperson"
                      />
                    )}
                  </form.AppField>
                ) : null}
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
            {/* A shared device is the Equipment stores tablet; Contracting has no device accounts. */}
            {canSetRole && business === 'equipment' ? (
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
              <BusinessRoleField
                business={business}
                disabled={isPending}
                fields={{ contractingRole: 'contractingRole', equipmentRole: 'equipmentRole' }}
                form={form}
                onRoleChange={onRoleChange}
                roleError={roleError}
              />
            ) : null}
            {extraFields}
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
