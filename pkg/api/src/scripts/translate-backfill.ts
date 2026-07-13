import { createOpenAiChatModel } from '@pkg/ai';
import { closeDatabaseConnection, db } from '@pkg/db';

import { runCatalogTranslationBackfill } from '../catalog-translations/catalog-translation-backfill.js';
import { createCatalogTranslationRunner } from '../catalog-translations/catalog-translation-runner.js';
import { getApiConfig } from '../env.js';
import { log } from '../logger.js';

const config = getApiConfig();
const run = createCatalogTranslationRunner({
  db,
  model: createOpenAiChatModel({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_TRANSLATION_MODEL }),
});

try {
  const result = await runCatalogTranslationBackfill({
    db,
    onProgress: ({ completed, error, key, result: itemResult, total }) => {
      const bindings = { completed, error, key, result: itemResult, total };
      if (itemResult === 'failed') log.ai.error(bindings, 'Catalog translation backfill item failed');
      else log.ai.info(bindings, 'Catalog translation backfill progress');
    },
    run,
  });

  log.root.info(result, 'Catalog translation backfill complete');
  if (result.failed > 0) process.exitCode = 1;
} finally {
  await closeDatabaseConnection();
}
