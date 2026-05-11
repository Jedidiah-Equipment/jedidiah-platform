import { useNavigate } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import type React from "react";
import { type FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client.js";
import { LoginFormSchema } from "./types.js";

type LoginPageProps = Record<string, never>;

export const LoginPage: React.FC<LoginPageProps> = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = LoginFormSchema.safeParse({ email, password });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your email and password.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await authClient.signIn.email(parsed.data);

      if (result.error) {
        const signUpResult = await signUpPrototypeUser(parsed.data);

        if (signUpResult.error) {
          setError(result.error.message ?? "Unable to sign in.");
          return;
        }
      }

      await navigate({ to: "/dashboard" });
    } catch {
      setError("Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-300">
            Jedidiah Equipment
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Sign in</h1>
        </div>

        <form
          className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow-2xl shadow-black/30"
          onSubmit={handleSubmit}
        >
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-neutral-200" htmlFor="email">
                Email
              </label>
              <input
                autoComplete="email"
                className="mt-2 block w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-base text-white outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-300/20"
                id="email"
                inputMode="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                type="text"
                value={email}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-200" htmlFor="password">
                Password
              </label>
              <input
                autoComplete="current-password"
                className="mt-2 block w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-base text-white outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-300/20"
                id="password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </div>

            {error ? (
              <p className="rounded-md border border-red-400/30 bg-red-950/50 px-3 py-2 text-sm text-red-100">
                {error}
              </p>
            ) : null}

            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-teal-300 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              <LogIn aria-hidden="true" size={18} />
              {isSubmitting ? "Signing in" : "Sign in"}
            </button>
          </div>
        </form>
      </div>
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
