import { UserPassword } from '@pkg/schema';
import { IconLoader2 } from '@tabler/icons-react';
import type React from 'react';
import { z } from 'zod';

import { useAppForm } from '@/components/form/index.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group.js';

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
      <form.AppField name="newPassword">
        {(field) => {
          const isInvalid = field.state.meta.errors.length > 0;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>Set New password</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  aria-invalid={isInvalid}
                  autoComplete="new-password"
                  disabled={isPending}
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  type="password"
                  value={field.state.value}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton disabled={isPending} type="submit" variant="outline">
                    {isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
                    Set password
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.AppField>
    </form>
  );
};
