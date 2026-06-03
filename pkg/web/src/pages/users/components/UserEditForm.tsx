import { UserSummary, type UserSummary as UserSummaryType } from '@pkg/schema';
import type React from 'react';
import { useId } from 'react';
import type { z } from 'zod';

import { useAppForm } from '@/components/form/index.js';
import { FieldGroup } from '@/components/ui/field.js';
import { Separator } from '@/components/ui/separator.js';
import { UserDepartmentsForm } from './UserDepartmentsForm.js';
import { SubmitFooter } from './UserFormFooter.js';
import { UserPasswordForm, type UserPasswordFormValues } from './UserPasswordForm.js';
import { RoleField } from './UserRoleField.js';

export type UserEditFormValues = z.infer<typeof UserEditFormValues>;
export const UserEditFormValues = UserSummary.pick({
  departments: true,
  email: true,
  emailVerified: true,
  name: true,
  phoneNumber: true,
  role: true,
  thumbnailDataUrl: true,
});

type UserEditFormProps = {
  canAssignDepartments: boolean;
  canSetPassword: boolean;
  canSetRole: boolean;
  canUpdateProfile: boolean;
  initialUser: UserSummaryType;
  isPending: boolean;
  isPasswordPending: boolean;
  onPasswordSubmit: (value: UserPasswordFormValues) => Promise<unknown>;
  onSubmit: (value: UserEditFormValues) => Promise<unknown>;
};

export const UserEditForm: React.FC<UserEditFormProps> = ({
  canAssignDepartments,
  canSetPassword,
  canSetRole,
  canUpdateProfile,
  initialUser,
  isPending,
  isPasswordPending,
  onPasswordSubmit,
  onSubmit,
}) => {
  const canSaveUser = canUpdateProfile || canSetRole || canAssignDepartments;
  const formId = useId();
  const form = useAppForm({
    defaultValues: {
      departments: initialUser.departments,
      email: initialUser.email,
      emailVerified: initialUser.emailVerified,
      name: initialUser.name,
      phoneNumber: initialUser.phoneNumber,
      role: initialUser.role,
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
                <form.AppField name="email">
                  {(field) => <field.TextField autoComplete="email" disabled={isPending} label="Email" type="email" />}
                </form.AppField>
                <form.AppField name="phoneNumber">
                  {(field) => <field.PhoneNumberField disabled={isPending} label="Phone number" />}
                </form.AppField>
                <form.AppField name="emailVerified">
                  {(field) => <field.CheckboxField disabled={isPending} label="Email verified" />}
                </form.AppField>
              </>
            ) : null}
            {canSetRole ? (
              <form.AppField name="role">
                {(field) => (
                  <RoleField
                    disabled={isPending}
                    errors={field.state.meta.errors}
                    name={field.name}
                    onRoleChange={(role) => field.handleChange(role)}
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
      {canSaveUser ? <SubmitFooter form={formId} isPending={isPending} label="Save user" /> : null}
    </div>
  );
};
