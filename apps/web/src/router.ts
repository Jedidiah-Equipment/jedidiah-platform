import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root.js";
import { dashboardRoute } from "./routes/dashboard.js";
import { indexRoute } from "./routes/index.js";
import { loginRoute } from "./routes/login.js";

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, dashboardRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
