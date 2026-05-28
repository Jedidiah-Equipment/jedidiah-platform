import { demoUsers, departmentLabels, getRolePermissions, roleLabels } from '@pkg/domain';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { AlertCircleIcon, Loader2Icon, LogInIcon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { AppBrand } from '@/components/common/AppBrand.js';
import { PermissionBadge } from '@/components/common/PermissionBadge.js';
import { useAppForm } from '@/components/form/index.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { FieldGroup } from '@/components/ui/field.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { authClient } from '@/lib/auth-client.js';
import { clearReactQueryCache } from '@/lib/trpc-cache.js';
import { LoginForm } from './types.js';

export const LoginPage: React.FC = () => {
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

        clearReactQueryCache(queryClient);
        await navigate({ to: '/dashboard' });
      } catch {
        setError('Unable to sign in.');
      }
    },
  });

  return (
    <section className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-5xl flex-col items-center gap-4">
        <Card className="w-full max-w-[420px]">
          <CardHeader>
            <AppBrand />
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

                <form.AppField name="password">
                  {(field) => (
                    <div className="flex flex-col gap-1">
                      <field.PasswordField label="Password" />
                      <Link
                        className="self-end text-sm text-muted-foreground hover:text-foreground"
                        to="/forgot-password"
                      >
                        Forgot password?
                      </Link>
                    </div>
                  )}
                </form.AppField>

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
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Permissions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoUsers.map((demoUser) => (
                    <TableRow key={demoUser.id}>
                      <TableCell className="min-w-52">
                        <div className="font-medium">{demoUser.name}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{roleLabels[demoUser.role]}</Badge>
                      </TableCell>
                      <TableCell className="min-w-44">
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
                      </TableCell>
                      <TableCell className="min-w-104 whitespace-normal">
                        <div className="flex flex-wrap gap-1">
                          {getRolePermissions(demoUser.role).map((permission) => (
                            <PermissionBadge key={permission} permission={permission} />
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
