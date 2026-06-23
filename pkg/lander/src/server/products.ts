import { createServerFn } from '@tanstack/react-start';

import type { ProductsCatalog } from './products-data.js';

export type { ProductsCatalog };

// SSR loader source for the Products page. The DB read and its server-only deps (@pkg/core, the Postgres
// client) are loaded inside the handler so they never reach the client bundle.
export const getProductsCatalog = createServerFn({ method: 'GET' }).handler(async (): Promise<ProductsCatalog> => {
  const [{ loadProductsCatalog }, { getDb }] = await Promise.all([import('./products-data.js'), import('./db.js')]);

  return loadProductsCatalog(getDb());
});
