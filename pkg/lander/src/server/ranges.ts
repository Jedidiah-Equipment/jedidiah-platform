import { createServerFn } from '@tanstack/react-start';

import type { HomeRange } from './ranges-data.js';

export type { HomeRange };

// SSR loader source for the Home Ranges grid. The DB read and its server-only deps (@pkg/core, the
// Postgres client) are loaded inside the handler so they never reach the client bundle.
export const getHomeRanges = createServerFn({ method: 'GET' }).handler(async (): Promise<HomeRange[]> => {
  const [{ loadHomeRanges }, { getDb }] = await Promise.all([import('./ranges-data.js'), import('./db.js')]);

  return loadHomeRanges(getDb());
});
