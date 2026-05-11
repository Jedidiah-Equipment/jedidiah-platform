import { z } from "zod";

export const ClientConfigSchema = z.object({
  appEnv: z.enum(["development", "test", "staging", "production"]),
  appBaseUrl: z.string().url(),
  apiBaseUrl: z.string().url(),
  authBaseUrl: z.string().url(),
});

export type ClientConfig = z.infer<typeof ClientConfigSchema>;

declare const __APP_CONFIG__: ClientConfig | undefined;

declare global {
  interface Window {
    __APP_CONFIG__?: ClientConfig;
  }
}

export function parseClientConfig(config: unknown): ClientConfig {
  return ClientConfigSchema.parse(config);
}

export function getClientConfig(): ClientConfig {
  if (typeof window === "undefined") {
    throw new Error("Client config is only available in the browser");
  }

  return parseClientConfig(
    typeof __APP_CONFIG__ === "undefined" ? window.__APP_CONFIG__ : __APP_CONFIG__,
  );
}
