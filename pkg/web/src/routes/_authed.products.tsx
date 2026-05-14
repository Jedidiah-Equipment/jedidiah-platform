import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/products')({
  staticData: {
    pageLabel: 'Products',
  },
  component: ProductsRoute,
});

function ProductsRoute() {
  return <Outlet />;
}
