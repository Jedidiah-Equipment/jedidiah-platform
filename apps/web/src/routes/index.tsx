import { createRoute, redirect } from "@tanstack/react-router";

import { getCurrentSession } from "../features/auth/auth-client.js";
import { rootRoute } from "./__root.js";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const session = await getCurrentSession();

    throw redirect({
      to: session ? "/dashboard" : "/login",
    });
  },
});
