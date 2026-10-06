import { createOpenAiChatModel } from '@pkg/ai';
import { sweepJobCompletions } from '@pkg/core/equipment';
import { db } from '@pkg/db';
import type { FastifyInstance } from 'fastify';
import type { BusinessWiring, BusinessWiringInput } from '../business-wiring.js';
import { log } from '../logger.js';
import { registerAiChatRoute } from '../routes/equipment/ai/ai-chat.route.js';
import { registerDocumentHttpRoutes } from '../routes/equipment/documents/document-http.route.js';
import { registerEntityFileRoutes } from '../routes/equipment/files/entity-file-http.route.js';
import { registerPartLabelHttpRoutes } from '../routes/equipment/parts/part-label-http.route.js';
import {
  createProductRangeImageRouteConfig,
  createProductRangeLogoRouteConfig,
} from '../routes/equipment/product-ranges/product-range-image-routes.js';
import { createProductImageRouteConfig } from '../routes/equipment/products/product-image-routes.js';
import { registerUserBadgeHttpRoutes } from '../routes/equipment/users/user-badge-http.route.js';
import { createCatalogTranslationRunner } from './catalog-translations/catalog-translation-runner.js';
import { type TranslationMarker, TranslationScheduler } from './catalog-translations/translation-scheduler.js';
import { JobCompletionSweeper } from './jobs/job-completion-sweeper.js';

export type EquipmentRouterDependencies = {
  catalogTranslationScheduler: TranslationMarker;
};

export async function registerEquipment(
  app: FastifyInstance,
  { config, storage }: BusinessWiringInput,
): Promise<BusinessWiring<EquipmentRouterDependencies>> {
  const catalogTranslationScheduler = new TranslationScheduler({
    onError: (error, key) => log.ai.error({ error, key }, 'Catalog translation failed'),
    run: createCatalogTranslationRunner({
      db,
      model: createOpenAiChatModel({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_TRANSLATION_MODEL }),
    }),
  });
  const jobCompletionSweeper = new JobCompletionSweeper({
    onError: (error) => log.root.error({ error }, 'Job completion sweep failed'),
    run: async () => {
      const result = await sweepJobCompletions({ db });
      if (result.completed > 0) log.root.info(result, 'Job completion sweep stamped Jobs');
    },
  });

  await registerAiChatRoute(app, { storage });
  await registerDocumentHttpRoutes(app, storage);
  await registerPartLabelHttpRoutes(app);
  await registerUserBadgeHttpRoutes(app);
  await registerEntityFileRoutes(app, [
    createProductImageRouteConfig(storage, { cacheDir: config.API_IMAGE_CACHE_DIR }),
    createProductRangeImageRouteConfig(storage),
    createProductRangeLogoRouteConfig(storage),
  ]);

  return {
    routerDependencies: { catalogTranslationScheduler },
    services: [catalogTranslationScheduler, jobCompletionSweeper],
  };
}
