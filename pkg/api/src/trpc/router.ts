import type { BuiltRouter } from '@trpc/server/unstable-core-do-not-import';
import type { ContractingRouterDependencies } from '../contracting/wiring.js';
import type { EquipmentRouterDependencies } from '../equipment/wiring.js';
import { auditRouter } from '../routes/audit/audit.router.js';
import { authRouter } from '../routes/auth/auth.router.js';
import { changelogRouter } from '../routes/changelog/changelog.router.js';
import { contractingActivityRouter } from '../routes/contracting/activity/activity.router.js';
import { createContractingBreakdownsRouter } from '../routes/contracting/breakdowns/breakdowns.router.js';
import { contractingDirectoryRouter } from '../routes/contracting/directory/directory.router.js';
import { contractingFleetRouter } from '../routes/contracting/fleet/fleet.router.js';
import { createContractingJobsRouter } from '../routes/contracting/jobs/jobs.router.js';
import { createContractingNotesRouter } from '../routes/contracting/notes/notes.router.js';
import { contractingRateCardRouter } from '../routes/contracting/rate-card/rate-card.router.js';
import { createContractingReadingsRouter } from '../routes/contracting/readings/readings.router.js';
import { contractingReportsRouter } from '../routes/contracting/reports/reports.router.js';
import { contractingServicesRouter } from '../routes/contracting/services/services.router.js';
import { contractingSettingsRouter } from '../routes/contracting/settings/settings.router.js';
import { createCatalogTranslationsRouter } from '../routes/equipment/catalog-translations/catalog-translations.router.js';
import { customersRouter } from '../routes/equipment/customers/customers.router.js';
import { documentsRouter } from '../routes/equipment/documents/documents.router.js';
import { feedbackRouter } from '../routes/equipment/feedback/feedback.router.js';
import { inventoryRouter } from '../routes/equipment/inventory/inventory.router.js';
import { jobActivityRouter } from '../routes/equipment/job-activity/job-activity.router.js';
import { jobsRouter } from '../routes/equipment/jobs/jobs.router.js';
import { laborRatesRouter } from '../routes/equipment/labor-rates/labor-rates.router.js';
import { partCategoriesRouter } from '../routes/equipment/part-categories/part-categories.router.js';
import { partsRouter } from '../routes/equipment/parts/parts.router.js';
import { createProductRangesRouter } from '../routes/equipment/product-ranges/product-ranges.router.js';
import { productUnitsRouter } from '../routes/equipment/product-units/product-units.router.js';
import { createProductsRouter } from '../routes/equipment/products/products.router.js';
import { purchaseOrdersRouter } from '../routes/equipment/purchase-orders/purchase-orders.router.js';
import { quotesRouter } from '../routes/equipment/quotes/quotes.router.js';
import { suppliersRouter } from '../routes/equipment/suppliers/suppliers.router.js';
import { userDepartmentsRouter } from '../routes/equipment/users/user-departments.router.js';
import { pushPreferencesRouter } from '../routes/push/push-preferences.router.js';
import { pushTokensRouter } from '../routes/push/push-tokens.router.js';
import {
  createLegacyContractingTranscriptionsRouter,
  createTranscriptionsRouter,
  type TranscriptionRouterDependencies,
} from '../routes/transcriptions/transcriptions.router.js';
import { usersRouter } from '../routes/users/users.router.js';
import { createCallerFactory, router } from './init.js';

/** Runtime services the business routers close over; built by each business's wiring, stubbed by tests. */
export type AppRouterDependencies = {
  contracting: ContractingRouterDependencies;
  equipment: EquipmentRouterDependencies;
  transcriptions: TranscriptionRouterDependencies;
};

type AppRouterRootTypes = (typeof authRouter)['_def']['_config']['$types'];

type AppRouterRecord = {
  contractingActivity: (typeof contractingActivityRouter)['_def']['record'];
  contractingBreakdowns: ReturnType<typeof createContractingBreakdownsRouter>['_def']['record'];
  contractingDirectory: (typeof contractingDirectoryRouter)['_def']['record'];
  contractingReadings: ReturnType<typeof createContractingReadingsRouter>['_def']['record'];
  contractingReports: (typeof contractingReportsRouter)['_def']['record'];
  contractingFleet: (typeof contractingFleetRouter)['_def']['record'];
  contractingJobs: ReturnType<typeof createContractingJobsRouter>['_def']['record'];
  contractingNotes: ReturnType<typeof createContractingNotesRouter>['_def']['record'];
  contractingRateCard: (typeof contractingRateCardRouter)['_def']['record'];
  contractingServices: (typeof contractingServicesRouter)['_def']['record'];
  contractingSettings: (typeof contractingSettingsRouter)['_def']['record'];
  contractingTranscriptions: ReturnType<typeof createLegacyContractingTranscriptionsRouter>['_def']['record'];
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
  laborRates: (typeof laborRatesRouter)['_def']['record'];
  partCategories: (typeof partCategoriesRouter)['_def']['record'];
  parts: (typeof partsRouter)['_def']['record'];
  productRanges: ReturnType<typeof createProductRangesRouter>['_def']['record'];
  productUnits: (typeof productUnitsRouter)['_def']['record'];
  products: ReturnType<typeof createProductsRouter>['_def']['record'];
  purchaseOrders: (typeof purchaseOrdersRouter)['_def']['record'];
  pushPreferences: (typeof pushPreferencesRouter)['_def']['record'];
  pushTokens: (typeof pushTokensRouter)['_def']['record'];
  quotes: (typeof quotesRouter)['_def']['record'];
  suppliers: (typeof suppliersRouter)['_def']['record'];
  transcriptions: ReturnType<typeof createTranscriptionsRouter>['_def']['record'];
  userDepartments: (typeof userDepartmentsRouter)['_def']['record'];
  users: (typeof usersRouter)['_def']['record'];
};

export type AppRouter = BuiltRouter<AppRouterRootTypes, AppRouterRecord>;

// Naming the router shape keeps declaration emit from serializing the full nested tRPC type.
export function createAppRouter({ contracting, equipment, transcriptions }: AppRouterDependencies): AppRouter {
  return router({
    contractingActivity: contractingActivityRouter,
    contractingBreakdowns: createContractingBreakdownsRouter(contracting.push),
    contractingReadings: createContractingReadingsRouter(contracting.readMeterPhoto),
    contractingReports: contractingReportsRouter,
    contractingFleet: contractingFleetRouter,
    contractingJobs: createContractingJobsRouter(contracting.push),
    contractingNotes: createContractingNotesRouter(contracting.push),
    contractingRateCard: contractingRateCardRouter,
    contractingServices: contractingServicesRouter,
    contractingSettings: contractingSettingsRouter,
    contractingTranscriptions: createLegacyContractingTranscriptionsRouter(transcriptions),
    contractingDirectory: contractingDirectoryRouter,
    audit: auditRouter,
    auth: authRouter,
    catalogTranslations: createCatalogTranslationsRouter(equipment.catalogTranslationScheduler),
    changelog: changelogRouter,
    customers: customersRouter,
    documents: documentsRouter,
    feedback: feedbackRouter,
    inventory: inventoryRouter,
    jobActivity: jobActivityRouter,
    jobs: jobsRouter,
    laborRates: laborRatesRouter,
    partCategories: partCategoriesRouter,
    parts: partsRouter,
    productRanges: createProductRangesRouter(equipment.catalogTranslationScheduler),
    productUnits: productUnitsRouter,
    products: createProductsRouter(equipment.catalogTranslationScheduler),
    purchaseOrders: purchaseOrdersRouter,
    pushPreferences: pushPreferencesRouter,
    pushTokens: pushTokensRouter,
    quotes: quotesRouter,
    suppliers: suppliersRouter,
    transcriptions: createTranscriptionsRouter(transcriptions),
    userDepartments: userDepartmentsRouter,
    users: usersRouter,
  }) as AppRouter;
}

export function createAppRouterCaller(dependencies: AppRouterDependencies): AppRouter['createCaller'] {
  return createCallerFactory(createAppRouter(dependencies));
}
