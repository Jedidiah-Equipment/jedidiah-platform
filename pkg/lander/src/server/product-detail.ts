import { createServerFn } from '@tanstack/react-start';

import type { ProductDetail } from './product-detail-data.js';

export type { ProductDetail };

// SSR loader source for the Product detail page. The DB read and its server-only deps (@pkg/core, the
// Postgres client) load inside the handler so they never reach the client bundle. Returns null for an
// unknown model code; the route turns that into a 404.
export const getProductDetail = createServerFn({ method: 'GET' })
  .validator((modelCode: string) => modelCode)
  .handler(async ({ data }): Promise<ProductDetail | null> => {
    const [{ loadProductDetail }, { getDb }] = await Promise.all([
      import('./product-detail-data.js'),
      import('./db.js'),
    ]);

    return loadProductDetail(getDb(), data);
  });
