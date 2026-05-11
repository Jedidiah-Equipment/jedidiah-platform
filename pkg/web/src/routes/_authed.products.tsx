import { ProductListInputSchema } from "@pkg/schema";
import { createFileRoute } from "@tanstack/react-router";

import { ProductsPage } from "@/pages/products/ProductsPage.js";

export const Route = createFileRoute("/_authed/products")({
  staticData: {
    pageLabel: "Products",
  },
  validateSearch: (search) => ProductListInputSchema.parse(search),
  component: ProductsRoute,
});

function ProductsRoute() {
  const search = Route.useSearch();

  return <ProductsPage search={search} />;
}
