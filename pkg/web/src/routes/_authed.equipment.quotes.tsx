import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/equipment/quotes')({
  staticData: {
    pageLabel: 'Quotes',
  },
  component: QuotesRoute,
});

function QuotesRoute() {
  return <Outlet />;
}
