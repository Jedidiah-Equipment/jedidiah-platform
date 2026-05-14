import { UserSummary, type UserSummary as UserSummaryType } from '@pkg/schema';
import type React from 'react';
import type { z } from 'zod';

import { useAppForm } from '@/components/form/index.js';
import { FieldGroup } from '@/components/ui/field.js';
import { SubmitFooter } from './UserFormFooter.js';
import { RoleField } from './UserRoleField.js';

export type UserRoleFormValues = z.infer<typeof UserRoleFormValues>;
export const UserRoleFormValues = UserSummary.pick({ role: true });

type UserRoleFormProps = {
  initialUser: UserSummaryType;
  isPending: boolean;
  onSubmit: (value: UserRoleFormValues) => Promise<unknown>;
};

export const UserRoleForm: React.FC<UserRoleFormProps> = ({ initialUser, isPending, onSubmit }) => {
  const form = useAppForm({
    defaultValues: {
      role: initialUser.role,
    } satisfies UserRoleFormValues,
    validators: {
      onSubmit: UserRoleFormValues,
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
      </FieldGroup>
      <SubmitFooter isPending={isPending} label="Save role" />
    </form>
  );
};
