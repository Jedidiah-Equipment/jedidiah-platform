import type { FastifyInstance } from 'fastify';

import type { ApiConfig } from './env.js';

type HealthRouteConfig = Pick<
  ApiConfig,
  | 'APP_ENV'
  | 'RAILWAY_DEPLOYMENT_ID'
  | 'RAILWAY_SNAPSHOT_ID'
  | 'RAILWAY_SERVICE_NAME'
  | 'RAILWAY_ENVIRONMENT_NAME'
  | 'RAILWAY_GIT_COMMIT_SHA'
>;

function getDeploymentMetadata(config: HealthRouteConfig) {
  return {
    appEnv: config.APP_ENV,
    serviceName: config.RAILWAY_SERVICE_NAME ?? null,
    environmentName: config.RAILWAY_ENVIRONMENT_NAME ?? null,
    deploymentId: config.RAILWAY_DEPLOYMENT_ID ?? null,
    snapshotId: config.RAILWAY_SNAPSHOT_ID ?? null,
    commitSha: config.RAILWAY_GIT_COMMIT_SHA ?? null,
  };
}

export async function registerHealthRoutes(app: FastifyInstance, config: HealthRouteConfig): Promise<void> {
  const deployment = getDeploymentMetadata(config);

  app.get('/health', async () => ({
    ok: true,
    ...deployment,
  }));
}
