import { ClientConfig, type ClientConfig as ClientConfigValue } from "@app/schema";

declare const __APP_CONFIG__: ClientConfigValue | undefined;

declare global {
  interface Window {
    __APP_CONFIG__?: ClientConfigValue;
  }
}

export function parseClientConfig(config: unknown): ClientConfigValue {
  return ClientConfig.parse(config);
}

export function getClientConfig(): ClientConfigValue {
  if (typeof window === "undefined") {
    throw new Error("Client config is only available in the browser");
  }

  return parseClientConfig(
    typeof __APP_CONFIG__ === "undefined" ? window.__APP_CONFIG__ : __APP_CONFIG__,
  );
}
