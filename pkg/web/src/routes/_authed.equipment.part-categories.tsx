import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireRoutePermission } from '@/lib/route-auth.js';
export const Route = createFileRoute('/_authed/equipment/part-categories')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'equipment_part_category:update'),
  component: Outlet,
  staticData: { pageLabel: 'Part categories' },
});
