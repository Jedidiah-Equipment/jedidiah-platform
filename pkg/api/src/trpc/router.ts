import { authRouter } from "../modules/auth/auth.router.js";
import { productsRouter } from "../modules/products/products.router.js";
import { router } from "./init.js";

export const appRouter = router({
  auth: authRouter,
  products: productsRouter,
});

export type AppRouter = typeof appRouter;
