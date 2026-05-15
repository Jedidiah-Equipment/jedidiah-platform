import { demoUsers, roleLabels } from '@pkg/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AlertCircleIcon, Loader2Icon, LogInIcon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useAppForm } from '@/components/form/index.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { FieldGroup } from '@/components/ui/field.js';
import { authClient } from '@/lib/auth-client.js';
import { clearTrpcCache } from '@/lib/trpc-cache.js';
import { departmentLabels } from '@/pages/users/components/department-labels.js';
import { LoginForm } from './types.js';

type LoginPageProps = Record<string, never>;

export const LoginPage: React.FC<LoginPageProps> = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      email: '',
      password: '',
    } satisfies LoginForm,
    validators: {
      onSubmit: LoginForm,
    },
    onSubmit: async ({ value }) => {
      setError(null);

      try {
        const result = await authClient.signIn.email(value);

        if (result.error) {
          setError(result.error.message ?? 'Unable to sign in.');
          return;
        }

        clearTrpcCache(queryClient);
        await navigate({ to: '/dashboard' });
      } catch {
        setError('Unable to sign in.');
      }
    },
  });

  return (
    <section className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-[760px] flex-col items-center gap-4">
        <Card className="w-full max-w-[420px]">
          <CardHeader>
            <CardDescription className="font-medium uppercase tracking-[0.18em] text-primary">
              Jedidiah Equipment
            </CardDescription>
            <CardTitle className="text-3xl">Sign in</CardTitle>
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
                <form.AppField name="email">
                  {(field) => <field.TextField autoComplete="email" inputMode="email" label="Email" />}
                </form.AppField>

                <form.AppField name="password">{(field) => <field.PasswordField label="Password" />}</form.AppField>

                {error ? (
                  <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>Unable to sign in</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
                      {isSubmitting ? (
                        <Loader2Icon data-icon="inline-start" className="animate-spin" />
                      ) : (
                        <LogInIcon data-icon="inline-start" />
                      )}
                      {isSubmitting ? 'Signing in' : 'Sign in'}
                    </Button>
                  )}
                </form.Subscribe>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
        <Card className="w-full" size="sm">
          <CardHeader>
            <CardDescription>Demo accounts</CardDescription>
            <CardTitle>Seed users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-md border">
              {demoUsers.map((demoUser) => (
                <div className="grid gap-2 p-3 sm:grid-cols-[1fr_1fr_1fr]" key={demoUser.id}>
                  <div className="min-w-0">
                    <div className="font-medium">{demoUser.name}</div>
                    <div className="truncate text-muted-foreground text-sm">{demoUser.email}</div>
                  </div>
                  <div className="flex items-start">
                    <Badge variant="outline">{roleLabels[demoUser.role]}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {demoUser.departments.length === 0 ? (
                      <span className="text-muted-foreground text-sm">No department</span>
                    ) : (
                      demoUser.departments.map((department) => (
                        <Badge key={department} variant="secondary">
                          {departmentLabels[department]}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
