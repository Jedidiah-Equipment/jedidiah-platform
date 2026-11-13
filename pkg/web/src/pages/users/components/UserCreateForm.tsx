import { isRoleSlotsSignInEligible } from '@pkg/domain';
import { type Business, UserAccount, UserPassword } from '@pkg/schema';
import { revalidateLogic, useStore } from '@tanstack/react-form';
import type React from 'react';
import { z } from 'zod';

import { useAppForm } from '@/components/form/index.js';
import { FieldGroup } from '@/components/ui/field.js';
import { BusinessRoleField } from './BusinessRoleField.js';
import { SubmitFooter } from './UserFormFooter.js';

const SignInCredentials = UserAccount.pick({ email: true }).extend({ password: UserPassword });

export type UserCreateFormValues = z.infer<typeof UserCreateFormValues>;
export const UserCreateFormValues = UserAccount.omit({
  assistantEnabled: true,
  disabled: true,
  email: true,
  id: true,
  thumbnailDataUrl: true,
})
  .extend({ email: z.string(), password: z.string() })
  .superRefine((value, ctx) => {
    if (!isRoleSlotsSignInEligible(value)) {
      return;
    }
    for (const issue of SignInCredentials.safeParse(value).error?.issues ?? []) {
      ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    }
  });

/** A new user starts in the business creating them, in the role most of its people hold. */
const defaultRoleSlots = {
  contracting: { contractingRole: 'foreman', equipmentRole: null },
  equipment: { contractingRole: null, equipmentRole: 'sales' },
} as const satisfies Record<Business, Pick<UserCreateFormValues, 'contractingRole' | 'equipmentRole'>>;

type UserCreateFormProps = {
  business: Business;
  canSetRole: boolean;
  /** The business's own fields, rendered after the role. */
  extraFields: React.ReactNode;
  isPending: boolean;
  onSubmit: (value: UserCreateFormValues) => Promise<unknown>;
};

export const UserCreateForm: React.FC<UserCreateFormProps> = ({
  business,
  canSetRole,
  extraFields,
  isPending,
  onSubmit,
}) => {
  const defaultValues: UserCreateFormValues = {
    email: '',
    emailVerified: true,
    isDevice: false,
    name: '',
    password: '',
    phoneNumber: null,
    ...defaultRoleSlots[business],
  };
  const form = useAppForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: UserCreateFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });
  const canSignIn = useStore(form.store, (state) => isRoleSlotsSignInEligible(state.values));

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
        {canSignIn ? (
          <form.AppField name="email">
            {(field) => <field.TextField autoComplete="email" label="Email" type="email" />}
          </form.AppField>
        ) : null}
        <form.AppField name="phoneNumber">{(field) => <field.PhoneNumberField label="Phone number" />}</form.AppField>
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
        <BusinessRoleField
          business={business}
          disabled={isPending}
          fields={{ contractingRole: 'contractingRole', equipmentRole: 'equipmentRole' }}
          form={form}
        />
        {extraFields}
        {canSignIn ? (
          <>
            <form.AppField name="emailVerified">
              {(field) => <field.CheckboxField label="Email verified" />}
            </form.AppField>
            <form.AppField name="password">
              {(field) => <field.PasswordField autoComplete="new-password" label="Password" />}
            </form.AppField>
          </>
        ) : null}
      </FieldGroup>
      <SubmitFooter isPending={isPending} label="Create user" />
    </form>
  );
};
