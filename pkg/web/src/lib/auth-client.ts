import { appRoleAccess, authorizationStatement } from "@pkg/schema";
import { adminClient } from "better-auth/client/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { createAuthClient } from "better-auth/react";

import { getClientConfig } from "./app-config.js";

const config = getClientConfig();

const ac = createAccessControl(authorizationStatement);

const authRoles = {
  admin: ac.newRole(appRoleAccess.admin),
  "product-editor": ac.newRole(appRoleAccess["product-editor"]),
  "product-viewer": ac.newRole(appRoleAccess["product-viewer"]),
};

export const authClient = createAuthClient({
  baseURL: config.authBaseUrl,
  plugins: [adminClient({ ac, roles: authRoles })],
});

export async function getCurrentSession() {
  const { data } = await authClient.getSession();

  return data;
}
