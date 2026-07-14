import { createFileRoute } from '@tanstack/react-router';

import { requireRoutePermission } from '@/lib/route-auth.js';
import { CatalogTranslationsPage } from '@/pages/catalog-translations/CatalogTranslationsPage.js';

export const Route = createFileRoute('/_authed/catalog-translations')({
  beforeLoad: async ({ context }) => {
    await requireRoutePermission(context, 'product_range:update');
  },
  staticData: {
    pageLabel: 'Translations',
  },
  component: CatalogTranslationsPage,
});
