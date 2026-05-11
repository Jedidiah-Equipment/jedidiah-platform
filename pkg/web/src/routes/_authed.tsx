import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AuthenticatedRouteShell } from "@/components/app-shell/AuthenticatedRouteShell.js";
import { getCurrentSession } from "@/lib/auth-client.js";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const session = await getCurrentSession();

    if (!session) {
      throw redirect({
        to: "/login",
      });
    }

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
