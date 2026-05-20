import { getReleaseMetadata, isRemoteAppEnv } from '@pkg/domain';
import { PostHog } from 'posthog-node';

import type { ApiConfig } from './env.js';

export type ObservabilityClient = {
  captureException: (error: unknown, distinctId?: string, properties?: Record<string, unknown>) => void;
  flush: () => Promise<void>;
};

export type Observability = {
  enabled: boolean;
  captureException: (error: unknown, properties?: Record<string, unknown>, distinctId?: string) => void;
  flush: () => Promise<void>;
};

export function createObservability(config: ApiConfig, client = createPostHogClient(config)): Observability {
  const enabled = isPostHogEnabled(config) && client !== null;

  return {
    enabled,
    captureException(error, properties, distinctId) {
      if (!enabled || !client) return;
      client.captureException(error, distinctId, {
        app: 'api',
        appEnv: config.APP_ENV,
        release: getReleaseMetadata({
          railwayDeploymentId: config.RAILWAY_DEPLOYMENT_ID ?? null,
          railwayGitCommitSha: config.RAILWAY_GIT_COMMIT_SHA ?? null,
        }),
        ...properties,
      });
    },
    async flush() {
      if (!enabled || !client) return;
      await client.flush();
    },
  };
}

export function isPostHogEnabled(
  config: Pick<ApiConfig, 'APP_ENV' | 'POSTHOG_ENABLED' | 'POSTHOG_PROJECT_TOKEN'>,
): boolean {
  return Boolean(config.POSTHOG_PROJECT_TOKEN && (config.POSTHOG_ENABLED ?? isRemoteAppEnv(config.APP_ENV)));
}

function createPostHogClient(config: ApiConfig): ObservabilityClient | null {
  if (!isPostHogEnabled(config)) return null;

  const token = config.POSTHOG_PROJECT_TOKEN;
  if (!token) return null;

  return new PostHog(token, {
    host: config.POSTHOG_HOST,
    enableExceptionAutocapture: true,
  });
}
