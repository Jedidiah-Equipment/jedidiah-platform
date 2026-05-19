import { createFileRoute, redirect } from '@tanstack/react-router';

import { getRouteSession } from '@/lib/route-auth.js';

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const session = await getRouteSession(context);

    throw redirect({
      to: session ? '/dashboard' : '/login',
    });
  },
});
