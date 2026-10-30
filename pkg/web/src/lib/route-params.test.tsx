import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { uuidParams } from './route-params.js';

async function render(path: string) {
  const rootRoute = createRootRoute({ component: Outlet });
  const recordRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/records/$id',
    params: uuidParams,
    component: () => <p>record</p>,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: rootRoute.addChildren([recordRoute]),
    defaultNotFoundComponent: () => <p>not found</p>,
    defaultErrorComponent: () => <p>crashed</p>,
  });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router as never} />);
}

describe('uuidParams', () => {
  it('opens a UUID and treats anything else as a page that does not exist, not a crash', async () => {
    expect(await render('/records/5791dc87-fe9b-4a72-9138-85f7d7ebb334')).toContain('record');
    expect(await render('/records/not-a-uuid')).toContain('not found');
  });
});
