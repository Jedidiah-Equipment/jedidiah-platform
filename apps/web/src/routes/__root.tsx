import { createRootRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "../components/layout/app-shell.js";

export const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
