import type { ClientConfig } from '@pkg/schema';
import posthog from 'posthog-js';
import { PostHogProvider as ReactPostHogProvider } from 'posthog-js/react';
import type React from 'react';
import type { PropsWithChildren } from 'react';

import { getClientConfig } from '@/lib/app-config.js';

const config = getClientConfig();

if (config.posthog.enabled && config.posthog.token) {
  const apiHost = getPostHogApiHost(config);

  posthog.init(config.posthog.token, {
    ...(apiHost ? { api_host: apiHost } : {}),
    ui_host: config.posthog.uiHost,
    autocapture: false,
    capture_exceptions: true,
    capture_pageview: 'history_change',
    disable_compression: true,
    loaded: (client) => {
      client.register({
        app: 'web',
        appEnv: config.appEnv,
        release: config.posthog.release,
      });
    },
    name: 'jedidiah-web',
    persistence: 'localStorage+cookie',
    person_profiles: 'identified_only',
  });
}

export const PostHogProvider: React.FC<PropsWithChildren> = ({ children }) => {
  return <ReactPostHogProvider client={posthog}>{children}</ReactPostHogProvider>;
};

function getPostHogApiHost(config: ClientConfig): string | undefined {
  return config.appEnv === 'development' ? undefined : config.posthog.apiHost;
}
