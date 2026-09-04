import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AuthenticatedRouteShell } from '@/components/app-shell/AuthenticatedRouteShell.js';
import { AppSidebar } from '@/equipment/components/app-shell/AppSidebar.js';
import { requireRouteBusinessAccess } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/equipment')({
  beforeLoad: ({ context }) => requireRouteBusinessAccess(context, 'equipment'),
  component: EquipmentRoute,
});

function EquipmentRoute() {
  return (
    <AuthenticatedRouteShell sidebar={<AppSidebar />}>
      <Outlet />
    </AuthenticatedRouteShell>
  );
}
