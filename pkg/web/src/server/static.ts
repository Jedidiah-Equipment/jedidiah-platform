import { buildWebServer } from './app.js';
import { getServerConfig } from './env.js';

const config = getServerConfig();
const app = buildWebServer(config);

await app.listen({ host: '0.0.0.0', port: config.port });
console.info(`Web server listening on port ${config.port}`);

process.on('SIGTERM', () => {
  app.close().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
});

process.on('SIGINT', () => {
  app.close().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
});
