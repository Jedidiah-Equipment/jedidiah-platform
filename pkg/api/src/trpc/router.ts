import { auditRouter } from "../routes/audit/audit.router.js";
import { authRouter } from "../routes/auth/auth.router.js";
import { productsRouter } from "../routes/products/products.router.js";
import { usersRouter } from "../routes/users/users.router.js";
import { createCallerFactory, router } from "./init.js";

export const appRouter = router({
  audit: auditRouter,
  auth: authRouter,
  products: productsRouter,
  users: usersRouter,
});

export const createAppRouterCaller = createCallerFactory(appRouter);

export type AppRouter = typeof appRouter;
