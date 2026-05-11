import { z } from "zod";

import { NodeEnvSchema } from "../domain/environment.js";

export const ClientConfig = z.object({
  appEnv: NodeEnvSchema,
  appBaseUrl: z.string().url(),
  apiBaseUrl: z.string().url(),
  authBaseUrl: z.string().url(),
});

export type ClientConfig = z.infer<typeof ClientConfig>;
