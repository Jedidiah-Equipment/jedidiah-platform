import { appRoleAccess, authorizationStatement } from '@pkg/domain';
import { adminClient } from 'better-auth/client/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { createAuthClient } from 'better-auth/react';

import { getClientConfig } from './app-config.js';

const config = getClientConfig();

const ac = createAccessControl(authorizationStatement);

const authRoles = {
  admin: ac.newRole(appRoleAccess.admin),
  'bay-operator': ac.newRole(appRoleAccess['bay-operator']),
  'job-department-manager': ac.newRole(appRoleAccess['job-department-manager']),
  'procurement-manager': ac.newRole(appRoleAccess['procurement-manager']),
  sales: ac.newRole(appRoleAccess.sales),
};

export const authClient = createAuthClient({
  baseURL: config.authBaseUrl,
  plugins: [adminClient({ ac, roles: authRoles })],
});
