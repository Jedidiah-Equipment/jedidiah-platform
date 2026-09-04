import { createFileRoute } from '@tanstack/react-router';
import { CatalogTranslationsPage } from '@/equipment/pages/catalog-translations/CatalogTranslationsPage.js';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/equipment/catalog-translations')({
  beforeLoad: async ({ context }) => {
    await requireRoutePermission(context, 'equipment_product_range:update');
  },
  staticData: {
    pageLabel: 'Translations',
  },
  component: CatalogTranslationsPage,
});
