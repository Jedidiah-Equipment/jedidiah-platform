import { z } from 'zod';

import { NodeEnv } from '../domain/environment.js';

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
