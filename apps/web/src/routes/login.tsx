import { createRoute, redirect } from "@tanstack/react-router";

import { getCurrentSession } from "@/lib/auth-client.js";
import { LoginPage } from "@/pages/login/LoginPage.js";
import { rootRoute } from "./__root.js";

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: async () => {
    const session = await getCurrentSession();

    if (session) {
      throw redirect({
        to: "/dashboard",
      });
    }
  },
  component: LoginPage,
});
