import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/parts')({
  staticData: {
    pageLabel: 'Parts',
  },
  component: PartsRoute,
});

function PartsRoute() {
  return <Outlet />;
}
