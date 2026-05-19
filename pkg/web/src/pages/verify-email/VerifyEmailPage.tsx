import { Link } from '@tanstack/react-router';
import { AlertCircleIcon, CheckCircleIcon, Loader2Icon } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { authClient } from '@/lib/auth-client.js';
import { Route } from '@/routes/verify-email.js';

type VerifyStatus = 'pending' | 'success' | 'error';

export const VerifyEmailPage: React.FC = () => {
  const { token } = Route.useSearch();
  const [status, setStatus] = useState<VerifyStatus>('pending');

  useEffect(() => {
    let cancelled = false;

    authClient
      .verifyEmail({ query: { token } })
      .then((result) => {
        if (cancelled) return;
        setStatus(result.error ? 'error' : 'success');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <section className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-[420px]">
        <CardHeader>
          <CardDescription className="font-medium uppercase tracking-[0.18em] text-primary">
            Jedidiah Equipment
          </CardDescription>
          <CardTitle className="text-3xl">Email verification</CardTitle>
        </CardHeader>

        <CardContent>
          {status === 'pending' ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2Icon className="animate-spin" size={16} />
              <span>Verifying your email address</span>
            </div>
          ) : status === 'success' ? (
            <div className="flex flex-col gap-4">
              <Alert>
                <CheckCircleIcon />
                <AlertTitle>Email verified</AlertTitle>
                <AlertDescription>Your email address has been verified. You can now sign in.</AlertDescription>
              </Alert>
              <Link className="text-sm text-muted-foreground hover:text-foreground" to="/login">
                Go to sign in
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Verification failed</AlertTitle>
                <AlertDescription>
                  This verification link is invalid or has expired. Please contact your administrator to resend the
                  verification email.
                </AlertDescription>
              </Alert>
              <Link className="text-sm text-muted-foreground hover:text-foreground" to="/login">
                Back to sign in
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};
