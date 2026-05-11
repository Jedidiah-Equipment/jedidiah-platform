import { parsePublicAppConfig } from "./app-config.js";

export function getPublicEnvConfig(env: NodeJS.ProcessEnv = process.env) {
  return parsePublicAppConfig({
    appEnv: env.PUBLIC_APP_ENV,
    appBaseUrl: env.PUBLIC_APP_BASE_URL,
    apiBaseUrl: env.PUBLIC_API_BASE_URL,
    authBaseUrl: env.PUBLIC_AUTH_BASE_URL,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  getPublicEnvConfig();
}
