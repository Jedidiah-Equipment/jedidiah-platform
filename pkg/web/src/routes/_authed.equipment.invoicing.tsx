import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/equipment/invoicing')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'equipment_quote:read'),
  component: Outlet,
  staticData: { pageLabel: 'Invoicing' },
});
