import { createFileRoute, redirect } from '@tanstack/react-router';

import { getRouteSession } from '@/lib/route-auth.js';
import { LoginPage } from '@/pages/login/LoginPage.js';

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context }) => {
    const session = await getRouteSession(context);

    if (session) {
      throw redirect({
        to: '/dashboard',
      });
    }
  },
  component: LoginPage,
});
