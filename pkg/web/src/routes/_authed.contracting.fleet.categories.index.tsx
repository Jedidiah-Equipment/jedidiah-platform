import { createFileRoute } from '@tanstack/react-router';
import { CategoriesPage } from '@/contracting/pages/fleet/CategoriesPage.js';
export const Route = createFileRoute('/_authed/contracting/fleet/categories/')({
  component: CategoriesPage,
  staticData: { pageLabel: 'Categories' },
});
