import { z } from 'zod';

import { type AppEnv, NodeEnv } from '../domain/environment.js';

export const POSTHOG_CLIENT_API_HOST = '/info';
export const POSTHOG_ASSET_HOST = 'https://us-assets.i.posthog.com';
export const POSTHOG_INGEST_HOST = 'https://us.i.posthog.com';
export const POSTHOG_UI_HOST = 'https://us.posthog.com';

export type ClientConfig = z.infer<typeof ClientConfig>;
export const ClientConfig = z.object({
  appEnv: NodeEnv,
  appBaseUrl: z.string().url(),
  apiBaseUrl: z.string().url(),
  authBaseUrl: z.string().url(),
  deploymentVersion: z.string().min(1).nullable().default(null),
  posthog: z
    .object({
      enabled: z.boolean(),
      token: z.string().min(1).optional(),
      apiHost: z.string().min(1),
      uiHost: z.string().url(),
      release: z.string().min(1).nullable(),
    })
    .default({
      enabled: false,
      apiHost: POSTHOG_CLIENT_API_HOST,
      uiHost: POSTHOG_UI_HOST,
      release: null,
    }),
});

type PostHogToggleConfig = {
  APP_ENV: AppEnv;
  POSTHOG_ENABLED?: boolean | undefined;
  POSTHOG_PROJECT_TOKEN?: string | undefined;
};

type PostHogSourceMapsToggleConfig = PostHogToggleConfig & {
  POSTHOG_SOURCEMAPS_ENABLED?: boolean | undefined;
  POSTHOG_API_KEY?: string | undefined;
  POSTHOG_PROJECT_ID?: string | undefined;
};

export function isPostHogEnabled(config: PostHogToggleConfig): boolean {
  return Boolean(config.POSTHOG_PROJECT_TOKEN && (config.POSTHOG_ENABLED ?? isRemoteAppEnv(config.APP_ENV)));
}

export function isPostHogSourceMapsEnabled(config: PostHogSourceMapsToggleConfig): boolean {
  const sourceMapsRequested =
    config.POSTHOG_SOURCEMAPS_ENABLED ?? config.POSTHOG_ENABLED ?? isRemoteAppEnv(config.APP_ENV);

  return Boolean(sourceMapsRequested && config.POSTHOG_API_KEY && config.POSTHOG_PROJECT_ID);
}

function isRemoteAppEnv(appEnv: AppEnv): boolean {
  return appEnv === 'staging' || appEnv === 'production';
}
