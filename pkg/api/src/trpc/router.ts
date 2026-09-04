import type { BuiltRouter } from '@trpc/server/unstable-core-do-not-import';
import type { TranslationMarker } from '../equipment/catalog-translations/translation-scheduler.js';
import { authRouter } from '../routes/auth/auth.router.js';
import { changelogRouter } from '../routes/changelog/changelog.router.js';
import { auditRouter } from '../routes/equipment/audit/audit.router.js';
import { createCatalogTranslationsRouter } from '../routes/equipment/catalog-translations/catalog-translations.router.js';
import { customersRouter } from '../routes/equipment/customers/customers.router.js';
import { documentsRouter } from '../routes/equipment/documents/documents.router.js';
import { feedbackRouter } from '../routes/equipment/feedback/feedback.router.js';
import { inventoryRouter } from '../routes/equipment/inventory/inventory.router.js';
import { jobActivityRouter } from '../routes/equipment/job-activity/job-activity.router.js';
import { jobsRouter } from '../routes/equipment/jobs/jobs.router.js';
import { partsRouter } from '../routes/equipment/parts/parts.router.js';
import { createProductRangesRouter } from '../routes/equipment/product-ranges/product-ranges.router.js';
import { productUnitsRouter } from '../routes/equipment/product-units/product-units.router.js';
import { createProductsRouter } from '../routes/equipment/products/products.router.js';
import { purchaseOrdersRouter } from '../routes/equipment/purchase-orders/purchase-orders.router.js';
import { quotesRouter } from '../routes/equipment/quotes/quotes.router.js';
import { suppliersRouter } from '../routes/equipment/suppliers/suppliers.router.js';
import { usersRouter } from '../routes/equipment/users/users.router.js';
import { createCallerFactory, router } from './init.js';

/** Runtime services the Equipment routers close over; supplied by the server, stubbed by tests. */
export type AppRouterDependencies = {
  catalogTranslationScheduler: TranslationMarker;
};

type AppRouterRootTypes = (typeof authRouter)['_def']['_config']['$types'];

type AppRouterRecord = {
  audit: (typeof auditRouter)['_def']['record'];
  auth: (typeof authRouter)['_def']['record'];
  catalogTranslations: ReturnType<typeof createCatalogTranslationsRouter>['_def']['record'];
  changelog: (typeof changelogRouter)['_def']['record'];
  customers: (typeof customersRouter)['_def']['record'];
  documents: (typeof documentsRouter)['_def']['record'];
  feedback: (typeof feedbackRouter)['_def']['record'];
  inventory: (typeof inventoryRouter)['_def']['record'];
  jobActivity: (typeof jobActivityRouter)['_def']['record'];
  jobs: (typeof jobsRouter)['_def']['record'];
  parts: (typeof partsRouter)['_def']['record'];
  productRanges: ReturnType<typeof createProductRangesRouter>['_def']['record'];
  productUnits: (typeof productUnitsRouter)['_def']['record'];
  products: ReturnType<typeof createProductsRouter>['_def']['record'];
  purchaseOrders: (typeof purchaseOrdersRouter)['_def']['record'];
  quotes: (typeof quotesRouter)['_def']['record'];
  suppliers: (typeof suppliersRouter)['_def']['record'];
  users: (typeof usersRouter)['_def']['record'];
};

export type AppRouter = BuiltRouter<AppRouterRootTypes, AppRouterRecord>;

// Naming the router shape keeps declaration emit from serializing the full nested tRPC type.
export function createAppRouter({ catalogTranslationScheduler }: AppRouterDependencies): AppRouter {
  return router({
    audit: auditRouter,
    auth: authRouter,
    catalogTranslations: createCatalogTranslationsRouter(catalogTranslationScheduler),
    changelog: changelogRouter,
    customers: customersRouter,
    documents: documentsRouter,
    feedback: feedbackRouter,
    inventory: inventoryRouter,
    jobActivity: jobActivityRouter,
    jobs: jobsRouter,
    parts: partsRouter,
    productRanges: createProductRangesRouter(catalogTranslationScheduler),
    productUnits: productUnitsRouter,
    products: createProductsRouter(catalogTranslationScheduler),
    purchaseOrders: purchaseOrdersRouter,
    quotes: quotesRouter,
    suppliers: suppliersRouter,
    users: usersRouter,
  }) as AppRouter;
}

export function createAppRouterCaller(dependencies: AppRouterDependencies): AppRouter['createCaller'] {
  return createCallerFactory(createAppRouter(dependencies));
}
