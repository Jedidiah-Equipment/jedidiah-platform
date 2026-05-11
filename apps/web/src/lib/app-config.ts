import { z } from "zod";

export const PublicAppConfigSchema = z.object({
  appEnv: z.enum(["development", "test", "staging", "production"]),
  appBaseUrl: z.string().url(),
  apiBaseUrl: z.string().url(),
  authBaseUrl: z.string().url(),
});

export type PublicAppConfig = z.infer<typeof PublicAppConfigSchema>;

declare global {
  interface Window {
    __APP_CONFIG__?: PublicAppConfig;
  }
}

export function parsePublicAppConfig(config: unknown): PublicAppConfig {
  return PublicAppConfigSchema.parse(config);
}

export function getPublicAppConfig(): PublicAppConfig {
  if (typeof window === "undefined") {
    throw new Error("Public app config is only available in the browser");
  }

  return parsePublicAppConfig(window.__APP_CONFIG__);
}
