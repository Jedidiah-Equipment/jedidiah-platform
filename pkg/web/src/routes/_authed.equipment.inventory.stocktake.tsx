import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/equipment/inventory/stocktake')({
  staticData: {
    pageLabel: 'Stocktake',
  },
  component: StocktakeRoute,
});

function StocktakeRoute() {
  return <Outlet />;
}
