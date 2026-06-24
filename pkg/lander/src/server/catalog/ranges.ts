import { createServerFn } from '@tanstack/react-start';

import type { FooterRange, HomeRange } from './ranges-data.js';

export type { FooterRange, HomeRange };

// SSR loader source for the Home Ranges grid. The DB read and its server-only deps (@pkg/core, the
// Postgres client) are loaded inside the handler so they never reach the client bundle.
export const getHomeRanges = createServerFn({ method: 'GET' }).handler(async (): Promise<HomeRange[]> => {
  const [{ loadHomeRanges }, { getDb }] = await Promise.all([import('./ranges-data.js'), import('../runtime/db.js')]);

  return loadHomeRanges(getDb());
});

// SSR loader source for the footer "Ranges" links. Loaded once via the root route loader, so it survives
// client navigations rather than re-reading on every page.
export const getFooterRanges = createServerFn({ method: 'GET' }).handler(async (): Promise<FooterRange[]> => {
  const [{ loadFooterRanges }, { getDb }] = await Promise.all([import('./ranges-data.js'), import('../runtime/db.js')]);

  return loadFooterRanges(getDb());
});

// SSR loader source for the Contact form's "Equipment of interest" options.
export const getRangeOptions = createServerFn({ method: 'GET' }).handler(async (): Promise<string[]> => {
  const [{ loadRangeOptions }, { getDb }] = await Promise.all([import('./ranges-data.js'), import('../runtime/db.js')]);

  return loadRangeOptions(getDb());
});
