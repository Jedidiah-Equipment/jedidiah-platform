import {
  IconCircleCheck,
  IconLoader2,
  IconMail,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
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

const ForgotPasswordForm = z.object({
  email: z.email('Enter a valid email address'),
});

type ForgotPasswordForm = z.infer<typeof ForgotPasswordForm>;

export const ForgotPasswordPage: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);

  const form = useAppForm({
    defaultValues: { email: '' } satisfies ForgotPasswordForm,
    validators: { onSubmit: ForgotPasswordForm },
    onSubmit: async ({ value }) => {
      try {
        await authClient.requestPasswordReset({
          email: value.email,
          redirectTo: `${window.location.origin}/reset-password`,
        });
      } catch {
        // intentionally swallow to avoid leaking user existence
      }
      setSubmitted(true);
    },
  });

  return (
    <section className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-[420px]">
        <CardHeader>
          <AppBrand />
          <CardTitle className="text-3xl">Reset password</CardTitle>
        </CardHeader>

        <CardContent>
          {submitted ? (
            <div className="flex flex-col gap-4">
              <Alert>
                <IconCircleCheck />
                <AlertTitle>Check your email</AlertTitle>
                <AlertDescription>
                  If that email address is associated with an account, you will receive a password reset link shortly.
                </AlertDescription>
              </Alert>
              <Link className="text-sm text-muted-foreground hover:text-foreground" to="/login">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <FieldGroup>
                <form.AppField name="email">
                  {(field) => <field.TextField autoComplete="email" inputMode="email" label="Email" />}
                </form.AppField>

                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
                      {isSubmitting ? (
                        <IconLoader2 data-icon="inline-start" className="animate-spin" />
                      ) : (
                        <IconMail data-icon="inline-start" />
                      )}
                      {isSubmitting ? 'Sending' : 'Send reset link'}
                    </Button>
                  )}
                </form.Subscribe>

                <Link className="block text-center text-sm text-muted-foreground hover:text-foreground" to="/login">
                  Back to sign in
                </Link>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  );
};
