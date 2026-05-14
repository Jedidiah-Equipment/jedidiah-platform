import { z } from 'zod';

import { NodeEnv } from '../domain/environment.js';

export type ClientConfig = z.infer<typeof ClientConfig>;
export const ClientConfig = z.object({
  appEnv: NodeEnv,
  appBaseUrl: z.string().url(),
  apiBaseUrl: z.string().url(),
  authBaseUrl: z.string().url(),
});
