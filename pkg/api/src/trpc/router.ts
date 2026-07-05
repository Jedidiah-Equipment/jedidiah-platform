import type { BuiltRouter } from '@trpc/server/unstable-core-do-not-import';

import { aiRouter } from '../routes/ai/ai.router.js';
import { auditRouter } from '../routes/audit/audit.router.js';
import { authRouter } from '../routes/auth/auth.router.js';
import { customersRouter } from '../routes/customers/customers.router.js';
import { documentsRouter } from '../routes/documents/documents.router.js';
import { feedbackRouter } from '../routes/feedback/feedback.router.js';
import { jobsRouter } from '../routes/jobs/jobs.router.js';
import { partsRouter } from '../routes/parts/parts.router.js';
import { productRangesRouter } from '../routes/product-ranges/product-ranges.router.js';
import { productsRouter } from '../routes/products/products.router.js';
import { quotesRouter } from '../routes/quotes/quotes.router.js';
import { suppliersRouter } from '../routes/suppliers/suppliers.router.js';
import { usersRouter } from '../routes/users/users.router.js';
import { createCallerFactory, router } from './init.js';

type AppRouterRootTypes = (typeof authRouter)['_def']['_config']['$types'];

type AppRouterRecord = {
  ai: (typeof aiRouter)['_def']['record'];
  audit: (typeof auditRouter)['_def']['record'];
  auth: (typeof authRouter)['_def']['record'];
  customers: (typeof customersRouter)['_def']['record'];
  documents: (typeof documentsRouter)['_def']['record'];
  feedback: (typeof feedbackRouter)['_def']['record'];
  jobs: (typeof jobsRouter)['_def']['record'];
  parts: (typeof partsRouter)['_def']['record'];
  productRanges: (typeof productRangesRouter)['_def']['record'];
  products: (typeof productsRouter)['_def']['record'];
  quotes: (typeof quotesRouter)['_def']['record'];
  suppliers: (typeof suppliersRouter)['_def']['record'];
  users: (typeof usersRouter)['_def']['record'];
};

export type AppRouter = BuiltRouter<AppRouterRootTypes, AppRouterRecord>;

// Naming the router shape keeps declaration emit from serializing the full nested tRPC type.
function createAppRouter(): AppRouter {
  return router({
    ai: aiRouter,
    audit: auditRouter,
    auth: authRouter,
    customers: customersRouter,
    documents: documentsRouter,
    feedback: feedbackRouter,
    jobs: jobsRouter,
    parts: partsRouter,
    productRanges: productRangesRouter,
    products: productsRouter,
    quotes: quotesRouter,
    suppliers: suppliersRouter,
    users: usersRouter,
  }) as AppRouter;
}

export const appRouter: AppRouter = createAppRouter();
export const createAppRouterCaller: AppRouter['createCaller'] = createCallerFactory(appRouter);
