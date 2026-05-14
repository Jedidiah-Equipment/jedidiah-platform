import { getApiConfig } from './env.js';
import { buildServer } from './server.js';

const config = getApiConfig();
const app = await buildServer(config);

try {
  await app.listen({
    host: '0.0.0.0',
    port: config.PORT,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
