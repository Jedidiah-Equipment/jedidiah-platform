import { getApiConfig } from './env.js';
import { createObservability } from './observability.js';
import { buildServer } from './server.js';

const config = getApiConfig();
const observability = createObservability(config);
const app = await buildServer(config, observability);

process.on('uncaughtException', (error) => {
  void shutdownAfterFatalException(error);
});

async function shutdownAfterFatalException(error: Error): Promise<void> {
  observability.captureException(error, { properties: { source: 'uncaughtException' } });
  app.log.error(error);

  try {
    await app.close();
  } catch (closeError) {
    app.log.error({ error: closeError }, 'Failed to close API server after uncaught exception');
    await observability.flush();
  }

  process.exit(1);
}

process.on('unhandledRejection', (reason) => {
  observability.captureException(reason, { properties: { source: 'unhandledRejection' } });
  app.log.error({ reason }, 'Unhandled rejection');
});

try {
  await app.listen({
    host: '0.0.0.0',
    port: config.PORT,
  });
} catch (error) {
  observability.captureException(error, { properties: { source: 'startup' } });
  app.log.error(error);
  await observability.flush();
  process.exit(1);
}
