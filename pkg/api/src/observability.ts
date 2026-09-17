import { getReleaseMetadata } from '@pkg/domain';
import { isPostHogEnabled } from '@pkg/schema';
import { PostHog } from 'posthog-node';

import type { ApiConfig } from './env.js';

export { isPostHogEnabled };

type CaptureExceptionParams = {
  distinctId?: string;
  properties?: Record<string, unknown>;
};

type CaptureEventParams = {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
};

export type PostHogObservabilityClient = Pick<PostHog, 'capture' | 'captureException' | 'flush'>;

export type Observability = {
  enabled: boolean;
  captureEvent: (params: CaptureEventParams) => void;
  captureException: (error: unknown, params?: CaptureExceptionParams) => void;
  flush: () => Promise<void>;
};

export function createObservability(
  config: ApiConfig,
  client: PostHogObservabilityClient | null = createPostHogClient(config),
): Observability {
  const enabled = isPostHogEnabled(config) && client !== null;

  return {
    enabled,
    captureEvent({ distinctId, event, properties }) {
      if (!enabled || !client) return;
      client.capture({
        distinctId,
        event,
        properties: {
          app: 'api',
          appEnv: config.APP_ENV,
          release: getReleaseMetadata({
            railwayDeploymentId: config.RAILWAY_DEPLOYMENT_ID ?? null,
            railwayGitCommitSha: config.RAILWAY_GIT_COMMIT_SHA ?? null,
          }),
          ...properties,
        },
      });
    },
    captureException(error, params) {
      if (!enabled || !client) return;
      client.captureException(error, params?.distinctId, {
        app: 'api',
        appEnv: config.APP_ENV,
        release: getReleaseMetadata({
          railwayDeploymentId: config.RAILWAY_DEPLOYMENT_ID ?? null,
          railwayGitCommitSha: config.RAILWAY_GIT_COMMIT_SHA ?? null,
        }),
        ...params?.properties,
      });
    },
    async flush() {
      if (!enabled || !client) return;
      await client.flush();
    },
  };
}

function createPostHogClient(config: ApiConfig): PostHogObservabilityClient | null {
  if (!isPostHogEnabled(config)) return null;

  const token = config.POSTHOG_PROJECT_TOKEN;
  if (!token) return null;

  return new PostHog(token, {
    host: config.POSTHOG_HOST,
    enableExceptionAutocapture: true,
  });
}
