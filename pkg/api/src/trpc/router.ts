import type { BuiltRouter } from '@trpc/server/unstable-core-do-not-import';

import { auditRouter } from '../routes/audit/audit.router.js';
import { authRouter } from '../routes/auth/auth.router.js';
import { customersRouter } from '../routes/customers/customers.router.js';
import { jobsRouter } from '../routes/jobs/jobs.router.js';
import { productsRouter } from '../routes/products/products.router.js';
import { quotesRouter } from '../routes/quotes/quotes.router.js';
import { stationsRouter } from '../routes/stations/stations.router.js';
import { usersRouter } from '../routes/users/users.router.js';
import { createCallerFactory, router } from './init.js';

type AppRouterRootTypes = (typeof authRouter)['_def']['_config']['$types'];

type AppRouterRecord = {
  audit: (typeof auditRouter)['_def']['record'];
  auth: (typeof authRouter)['_def']['record'];
  customers: (typeof customersRouter)['_def']['record'];
  jobs: (typeof jobsRouter)['_def']['record'];
  products: (typeof productsRouter)['_def']['record'];
  quotes: (typeof quotesRouter)['_def']['record'];
  stations: (typeof stationsRouter)['_def']['record'];
  users: (typeof usersRouter)['_def']['record'];
};

export type AppRouter = BuiltRouter<AppRouterRootTypes, AppRouterRecord>;

// Naming the router shape keeps declaration emit from serializing the full nested tRPC type.
function createAppRouter(): AppRouter {
  return router({
    audit: auditRouter,
    auth: authRouter,
    customers: customersRouter,
    jobs: jobsRouter,
    products: productsRouter,
    quotes: quotesRouter,
    stations: stationsRouter,
    users: usersRouter,
  }) as AppRouter;
}

export const appRouter: AppRouter = createAppRouter();
export const createAppRouterCaller: AppRouter['createCaller'] = createCallerFactory(appRouter);
