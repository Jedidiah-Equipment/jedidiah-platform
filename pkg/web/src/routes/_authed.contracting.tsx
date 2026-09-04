import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AuthenticatedRouteShell } from '@/components/app-shell/AuthenticatedRouteShell.js';
import { AppSidebar } from '@/contracting/components/app-shell/AppSidebar.js';
import { requireRouteBusinessAccess } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting')({
  beforeLoad: ({ context }) => requireRouteBusinessAccess(context, 'contracting'),
  component: ContractingRoute,
});

function ContractingRoute() {
  return (
    <AuthenticatedRouteShell sidebar={<AppSidebar />}>
      <Outlet />
    </AuthenticatedRouteShell>
  );
}
