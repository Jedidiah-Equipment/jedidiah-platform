import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    ok: true,
  }));

  app.get('/api/version', async () => ({
    name: '@pkg/api',
    version: '0.0.0',
  }));
}
