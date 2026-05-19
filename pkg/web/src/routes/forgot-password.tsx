import { createFileRoute, redirect } from '@tanstack/react-router';

import { getRouteSession } from '@/lib/route-auth.js';
import { ForgotPasswordPage } from '@/pages/login/ForgotPasswordPage.js';

export const Route = createFileRoute('/forgot-password')({
  beforeLoad: async ({ context }) => {
    const session = await getRouteSession(context);

    if (session) {
      throw redirect({ to: '/dashboard' });
    }
  },
  component: ForgotPasswordPage,
});
