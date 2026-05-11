import { createRootRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "../components/app-shell/AppShell.js";

export const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
