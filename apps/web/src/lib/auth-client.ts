import { createAuthClient } from "better-auth/react";

import { getPublicAppConfig } from "./app-config.js";

const config = getPublicAppConfig();

export const authClient = createAuthClient({
  baseURL: config.authBaseUrl,
});

export async function getCurrentSession() {
  const { data } = await authClient.getSession();

  return data;
}
