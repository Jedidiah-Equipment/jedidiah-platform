import { createServerFn } from '@tanstack/react-start';

import type { Locale } from '../../lib/locale.js';
import type { ProductDetail } from './product-detail-data.js';

export type { ProductDetail };

type ProductDetailRequest = { locale: Locale; modelCode: string };

// SSR loader source for the Product detail page. The DB read and its server-only deps (@pkg/core, the
// Postgres client) load inside the handler so they never reach the client bundle. Returns null for an
// unknown model code; the route turns that into a 404.
export const getProductDetail = createServerFn({ method: 'GET' })
  .validator((request: ProductDetailRequest) => request)
  .handler(async ({ data }): Promise<ProductDetail | null> => {
    const [{ loadProductDetail }, { getDb }] = await Promise.all([
      import('./product-detail-data.js'),
      import('../runtime/db.js'),
    ]);

    return loadProductDetail(getDb(), data.modelCode, data.locale);
  });
