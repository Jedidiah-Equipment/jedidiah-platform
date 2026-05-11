import { useNavigate } from "@tanstack/react-router";
import { AlertCircleIcon, Loader2Icon, LogInIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useAppForm } from "@/components/form/index.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";
import { FieldGroup } from "@/components/ui/field.js";
import { authClient } from "@/lib/auth-client.js";
import { LoginFormSchema, type LoginFormValues } from "./types.js";

type LoginPageProps = Record<string, never>;

export const LoginPage: React.FC<LoginPageProps> = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      email: "",
      password: "",
    } satisfies LoginFormValues,
    validators: {
      onSubmit: LoginFormSchema,
    },
    onSubmit: async ({ value }) => {
      setError(null);

      try {
        const result = await authClient.signIn.email(value);

        if (result.error) {
          const signUpResult = await signUpPrototypeUser(value);

          if (signUpResult.error) {
            setError(result.error.message ?? "Unable to sign in.");
            return;
          }
        }

        await navigate({ to: "/dashboard" });
      } catch {
        setError("Unable to sign in.");
      }
    },
  });

  return (
    <section className="flex min-h-screen items-center justify-center px-6 py-12">
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
                {(field) => (
                  <field.TextField autoComplete="email" inputMode="email" label="Email" />
                )}
              </form.AppField>

              <form.AppField name="password">
                {(field) => <field.PasswordField label="Password" />}
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
                    {isSubmitting ? "Signing in" : "Sign in"}
                  </Button>
                )}
              </form.Subscribe>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </section>
  );
};

async function signUpPrototypeUser(values: { email: string; password: string }) {
  // BIG WARNING: EARLY PROTOTYPE ONLY.
  // This intentionally creates a user from the login form when sign-in fails.
  // Remove this before real users, public environments, invitations, or access control exist.
  return authClient.signUp.email({
    email: values.email,
    password: values.password,
    name: values.email,
  });
}
