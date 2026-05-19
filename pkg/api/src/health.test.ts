import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { registerHealthRoutes } from './health.js';

describe('health routes', () => {
  it('returns Railway deployment metadata from health', async () => {
    const app = Fastify();

    await registerHealthRoutes(app, {
      APP_ENV: 'production',
      RAILWAY_SERVICE_NAME: 'api',
      RAILWAY_ENVIRONMENT_NAME: 'staging',
      RAILWAY_DEPLOYMENT_ID: 'deployment_123',
      RAILWAY_SNAPSHOT_ID: 'snapshot_123',
      RAILWAY_GIT_COMMIT_SHA: 'abcdef123456',
    });

    const response = await app.inject('/health');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      appEnv: 'production',
      serviceName: 'api',
      environmentName: 'staging',
      deploymentId: 'deployment_123',
      snapshotId: 'snapshot_123',
      commitSha: 'abcdef123456',
    });

    await app.close();
  });

  it('keeps health metadata predictable when Railway vars are absent', async () => {
    const app = Fastify();

    await registerHealthRoutes(app, {
      APP_ENV: 'development',
      RAILWAY_SERVICE_NAME: undefined,
      RAILWAY_ENVIRONMENT_NAME: undefined,
      RAILWAY_DEPLOYMENT_ID: undefined,
      RAILWAY_SNAPSHOT_ID: undefined,
      RAILWAY_GIT_COMMIT_SHA: undefined,
    });

    const response = await app.inject('/health');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      appEnv: 'development',
      serviceName: null,
      environmentName: null,
      deploymentId: null,
      snapshotId: null,
      commitSha: null,
    });

    await app.close();
  });
});
