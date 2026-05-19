import { createFileRoute, Outlet } from '@tanstack/react-router';

import { AuthenticatedRouteShell } from '@/components/app-shell/AuthenticatedRouteShell.js';
import { requireRouteSession } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context }) => {
    const session = await requireRouteSession(context);
    return { session };
  },
  component: AuthedRoute,
});

function AuthedRoute() {
  return (
    <AuthenticatedRouteShell>
      <Outlet />
    </AuthenticatedRouteShell>
  );
}
