import { authRouter } from "../modules/auth/auth.router.js";
import { productsRouter } from "../modules/products/products.router.js";
import { createCallerFactory, router } from "./init.js";

export const appRouter = router({
  auth: authRouter,
  products: productsRouter,
});

export const createAppRouterCaller = createCallerFactory(appRouter);

export type AppRouter = typeof appRouter;
