import { UserPassword, UserSummary } from '@pkg/schema';
import type React from 'react';
import type { z } from 'zod';

import { useAppForm } from '@/components/form/index.js';
import { FieldGroup } from '@/components/ui/field.js';
import { UserDepartmentsForm } from './UserDepartmentsForm.js';
import { SubmitFooter } from './UserFormFooter.js';
import { RoleField } from './UserRoleField.js';

export type UserCreateFormValues = z.infer<typeof UserCreateFormValues>;
export const UserCreateFormValues = UserSummary.omit({ id: true }).extend({
  password: UserPassword,
});

type UserCreateFormProps = {
  canAssignDepartments: boolean;
  isPending: boolean;
  onSubmit: (value: UserCreateFormValues) => Promise<unknown>;
};

export const UserCreateForm: React.FC<UserCreateFormProps> = ({ canAssignDepartments, isPending, onSubmit }) => {
  const defaultValues: UserCreateFormValues = {
    departments: [],
    email: '',
    emailVerified: false,
    name: '',
    password: '',
    role: 'product-viewer',
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
