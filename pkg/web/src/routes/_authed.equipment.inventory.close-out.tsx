import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/equipment/inventory/close-out')({
  staticData: {
    pageLabel: 'Close-out',
  },
  component: CloseOutRoute,
});

function CloseOutRoute() {
  return <Outlet />;
}
