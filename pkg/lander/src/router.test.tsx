// @vitest-environment jsdom

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  RouterProvider,
} from '@tanstack/react-router';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { LanderErrorPage } from './components/error-page.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const captureAnalyticsException = vi.hoisted(() => vi.fn());

vi.mock('./lib/analytics.js', () => ({ captureAnalyticsException }));
// The generated tree pulls in every route and its server functions; a stub keeps this unit test off the DB.
vi.mock('./routeTree.gen.js', async () => {
  const { createRootRoute: root } = await import('@tanstack/react-router');
  return { routeTree: root() };
});

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = undefined;
  vi.clearAllMocks();
});

describe('getRouter', () => {
  test('wires the branded error page and reports caught errors to PostHog', async () => {
    const { getRouter } = await import('./router.js');
    const router = getRouter();
    const error = new Error('loader failed');

    expect(router.options.defaultErrorComponent).toBe(LanderErrorPage);
    router.options.defaultOnCatch?.(error, { componentStack: '' });

    // The router hands the boundary an errorInfo too, which captureAnalyticsException ignores.
    expect(captureAnalyticsException).toHaveBeenCalledWith(error, { componentStack: '' });
  });
});

describe('router error handling', () => {
  const rootRoute = createRootRoute();
  const throwsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/throws',
    loader: () => {
      throw new Error('transient loader failure');
    },
  });
  const missingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/missing',
    loader: () => {
      throw notFound();
    },
  });
  const routeTree = rootRoute.addChildren([throwsRoute, missingRoute]);

  async function render(path: string, onCatch: (error: Error) => void) {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
      defaultErrorComponent: LanderErrorPage,
      defaultOnCatch: onCatch,
    });
    await router.load();

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => root?.render(<RouterProvider router={router} />));
    return container;
  }

  test('shows the branded error page when a loader throws', async () => {
    const onCatch = vi.fn();

    const container = await render('/throws', onCatch);

    expect(container.textContent).toContain('This page did not load');
    expect(onCatch).toHaveBeenCalledOnce();
  });

  test('routes notFound to the not-found path without reporting an exception', async () => {
    const onCatch = vi.fn();

    const container = await render('/missing', onCatch);

    expect(container.textContent).not.toContain('This page did not load');
    expect(onCatch).not.toHaveBeenCalled();
  });
});
