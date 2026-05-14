import { createRouter } from '@tanstack/react-router';

import { routeTree } from '@/app/route-tree.gen.js';
import type { RouterContext } from '@/app/router-context.js';

export const router = createRouter({
  context: undefined as unknown as RouterContext,
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }

  interface StaticDataRouteOption {
    pageLabel?: string;
  }
}
