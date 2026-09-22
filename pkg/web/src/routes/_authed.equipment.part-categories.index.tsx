import { createFileRoute } from '@tanstack/react-router';
import { PartCategoriesPage } from '@/equipment/pages/part-categories/PartCategoriesPage.js';
export const Route = createFileRoute('/_authed/equipment/part-categories/')({
  component: PartCategoriesPage,
  staticData: { pageLabel: 'Part categories' },
});
