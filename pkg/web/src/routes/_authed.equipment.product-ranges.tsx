import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/product-ranges')({
  staticData: {
    pageLabel: 'Product Ranges',
  },
  component: ProductRangesRoute,
});

function ProductRangesRoute() {
  return <Outlet />;
}
