import { createServerFn } from '@tanstack/react-start';

import type { Locale } from '../../lib/locale.js';
import type { ProductsCatalog } from './products-data.js';

export type { ProductsCatalog };

type LocaleRequest = { locale: Locale };

// SSR loader source for the Products page. The DB read and its server-only deps (@pkg/core, the Postgres
// client) are loaded inside the handler so they never reach the client bundle.
export const getProductsCatalog = createServerFn({ method: 'GET' })
  .validator((request: LocaleRequest) => request)
  .handler(async ({ data }): Promise<ProductsCatalog> => {
    const [{ loadProductsCatalog }, { getDb }] = await Promise.all([
      import('./products-data.js'),
      import('../runtime/db.js'),
    ]);

    return loadProductsCatalog(getDb(), data.locale);
  });
