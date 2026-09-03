import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/equipment/units')({
  staticData: {
    pageLabel: 'Units',
  },
  component: UnitsRoute,
});

function UnitsRoute() {
  return <Outlet />;
}
