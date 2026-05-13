import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { getClientConfig } from "./app-config.js";

const config = getClientConfig();

export const authClient = createAuthClient({
  baseURL: config.authBaseUrl,
  plugins: [adminClient()],
});

export async function getCurrentSession() {
  const { data } = await authClient.getSession();

  return data;
}
