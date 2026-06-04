import { UserPassword } from '@pkg/schema';
import {
  IconAlertCircle,
  IconKey,
  IconLoader2,
} from '@tabler/icons-react';
import { Link, useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';
import { z } from 'zod';

import { AppBrand } from '@/components/common/AppBrand.js';
import { useAppForm } from '@/components/form/index.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { FieldGroup } from '@/components/ui/field.js';
import { authClient } from '@/lib/auth-client.js';
import { Route } from '@/routes/reset-password.js';

const ResetPasswordForm = z
  .object({
    confirmNewPassword: UserPassword,
    newPassword: UserPassword,
  })
  .refine((value) => value.confirmNewPassword === value.newPassword, {
    message: 'Passwords must match.',
    path: ['confirmNewPassword'],
  });

type ResetPasswordForm = z.infer<typeof ResetPasswordForm>;

export const ResetPasswordPage: React.FC = () => {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { confirmNewPassword: '', newPassword: '' } satisfies ResetPasswordForm,
    validators: { onSubmit: ResetPasswordForm },
    onSubmit: async ({ value }) => {
      setError(null);

      try {
        const result = await authClient.resetPassword({ newPassword: value.newPassword, token });

        if (result.error) {
          setError(result.error.message ?? 'Unable to reset password.');
          return;
        }

        await navigate({ to: '/login' });
      } catch {
        setError('Unable to reset password.');
      }
    },
  });

  return (
    <section className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-[420px]">
        <CardHeader>
          <AppBrand />
          <CardTitle className="text-3xl">Set new password</CardTitle>
        </CardHeader>

        <CardContent>
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
              <form.AppField name="confirmNewPassword">
                {(field) => <field.PasswordField autoComplete="new-password" label="Confirm password" />}
              </form.AppField>

              {error ? (
                <Alert variant="destructive">
                  <IconAlertCircle />
                  <AlertTitle>Unable to reset password</AlertTitle>
                  <AlertDescription>
                    {error}{' '}
                    <Link className="underline" to="/forgot-password">
                      Request a new link.
                    </Link>
                  </AlertDescription>
                </Alert>
              ) : null}

              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
                    {isSubmitting ? (
                      <IconLoader2 data-icon="inline-start" className="animate-spin" />
                    ) : (
                      <IconKey data-icon="inline-start" />
                    )}
                    {isSubmitting ? 'Saving' : 'Set new password'}
                  </Button>
                )}
              </form.Subscribe>

              <Link className="block text-center text-sm text-muted-foreground hover:text-foreground" to="/login">
                Back to sign in
              </Link>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </section>
  );
};
