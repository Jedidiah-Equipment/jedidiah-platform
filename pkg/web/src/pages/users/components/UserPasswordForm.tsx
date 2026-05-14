import { UserPassword } from '@pkg/schema';
import type React from 'react';
import { z } from 'zod';

import { useAppForm } from '@/components/form/index.js';
import { FieldGroup } from '@/components/ui/field.js';
import { SubmitFooter } from './UserFormFooter.js';

export type UserPasswordFormValues = z.infer<typeof UserPasswordFormValues>;
export const UserPasswordFormValues = z.object({
  newPassword: UserPassword,
});

type UserPasswordFormProps = {
  isPending: boolean;
  onSubmit: (value: UserPasswordFormValues) => Promise<unknown>;
};

export const UserPasswordForm: React.FC<UserPasswordFormProps> = ({ isPending, onSubmit }) => {
  const form = useAppForm({
    defaultValues: {
      newPassword: '',
    } satisfies UserPasswordFormValues,
    validators: {
      onSubmit: UserPasswordFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
      form.reset();
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
        <form.AppField name="newPassword">
          {(field) => <field.PasswordField autoComplete="new-password" label="New password" />}
        </form.AppField>
      </FieldGroup>
      <SubmitFooter isPending={isPending} label="Set password" />
    </form>
  );
};
