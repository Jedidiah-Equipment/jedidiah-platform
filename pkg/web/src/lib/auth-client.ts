import { appRoleAccess, authorizationStatement } from '@pkg/domain';
import { adminClient } from 'better-auth/client/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { createAuthClient } from 'better-auth/react';

import { getClientConfig } from './app-config.js';

const config = getClientConfig();

const ac = createAccessControl(authorizationStatement);

const authRoles = {
  admin: ac.newRole(appRoleAccess.admin),
  'job-stage-editor': ac.newRole(appRoleAccess['job-stage-editor']),
  'job-supervisor': ac.newRole(appRoleAccess['job-supervisor']),
  'job-viewer': ac.newRole(appRoleAccess['job-viewer']),
  'product-editor': ac.newRole(appRoleAccess['product-editor']),
  'product-viewer': ac.newRole(appRoleAccess['product-viewer']),
  sales: ac.newRole(appRoleAccess.sales),
};

export const authClient = createAuthClient({
  baseURL: config.authBaseUrl,
  plugins: [adminClient({ ac, roles: authRoles })],
});

export async function getCurrentSession() {
  const { data } = await authClient.getSession();

  return data;
}
