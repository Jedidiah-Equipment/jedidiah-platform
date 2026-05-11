import { createRoute, redirect } from "@tanstack/react-router";

import { getCurrentSession } from "../lib/auth-client.js";
import { DashboardPage } from "../pages/dashboard/DashboardPage.js";
import { rootRoute } from "./__root.js";

export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  beforeLoad: async () => {
    const session = await getCurrentSession();

    if (!session) {
      throw redirect({
        to: "/login",
      });
    }

    return { session };
  },
  component: DashboardPage,
});
