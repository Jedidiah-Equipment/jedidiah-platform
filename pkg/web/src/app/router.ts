import { createRouter } from "@tanstack/react-router";

import { routeTree } from "@/app/route-tree.gen.js";

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }

  interface StaticDataRouteOption {
    pageLabel?: string;
  }
}
