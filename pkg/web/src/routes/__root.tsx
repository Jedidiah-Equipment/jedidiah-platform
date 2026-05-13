import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import type { RouterContext } from "@/app/router-context.js";
import { AppShell } from "@/components/app-shell/AppShell.js";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
