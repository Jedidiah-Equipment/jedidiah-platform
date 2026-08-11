import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Static markup for a component that renders router-aware children such as `Link`.
 *
 * `Link` reads the router off context to build its href, so rendering one without a provider throws.
 * The harness mounts the tree under a throwaway memory router: hrefs still resolve from the `to` and
 * `search` given, which is what a link assertion is about.
 */
export async function renderWithRouter(ui: React.ReactNode): Promise<string> {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> });

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute,
  });

  // RouterProvider renders its matches, and there are none until the first load resolves.
  await router.load();

  // The app's generated tree is what types `Link`; this throwaway tree only has to render.
  return renderToStaticMarkup(<RouterProvider router={router as never} />);
}
