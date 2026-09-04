import { createFileRoute, Outlet } from '@tanstack/react-router';

import { requireRouteSession } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context }) => {
    const session = await requireRouteSession(context);
    return { session };
  },
  component: AuthedRoute,
});

function AuthedRoute() {
  return <Outlet />;
}
