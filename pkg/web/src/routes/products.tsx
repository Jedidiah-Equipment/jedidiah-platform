import { createRoute, redirect } from "@tanstack/react-router";

import { getCurrentSession } from "@/lib/auth-client.js";
import { ProductsPage } from "@/pages/products/ProductsPage.js";
import { rootRoute } from "./__root.js";

export const productsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/products",
  beforeLoad: async () => {
    const session = await getCurrentSession();

    if (!session) {
      throw redirect({
        to: "/login",
      });
    }

    return { session };
  },
  component: ProductsPage,
});
