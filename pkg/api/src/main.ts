import { getApiConfig } from './env.js';
import { createObservability } from './observability.js';
import { buildServer } from './server.js';

const config = getApiConfig();
const observability = createObservability(config);
const app = await buildServer(config, observability);

process.on('uncaughtException', (error) => {
  observability.captureException(error, { source: 'uncaughtException' });
  app.log.error(error);
  process.exitCode = 1;
});

process.on('unhandledRejection', (reason) => {
  observability.captureException(reason, { source: 'unhandledRejection' });
  app.log.error({ reason }, 'Unhandled rejection');
});

try {
  await app.listen({
    host: '0.0.0.0',
    port: config.PORT,
  });
} catch (error) {
  observability.captureException(error, { source: 'startup' });
  app.log.error(error);
  await observability.flush();
  process.exit(1);
}
