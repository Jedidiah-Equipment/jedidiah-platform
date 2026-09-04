import { createFileRoute, redirect } from '@tanstack/react-router';

import { businessHomeFor, getRouteAccess, getRouteSession } from '@/lib/route-auth.js';

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const session = await getRouteSession(context);

    throw redirect({ to: session ? businessHomeFor(await getRouteAccess(context)) : '/login' });
  },
});
