import { appRoleAccess, authorizationStatement } from '@pkg/domain';
import { adminClient, inferAdditionalFields } from 'better-auth/client/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { createAuthClient } from 'better-auth/react';

import { getClientConfig } from './app-config.js';

const config = getClientConfig();

const ac = createAccessControl(authorizationStatement);

const authRoles = {
  admin: ac.newRole(appRoleAccess.admin),
  'super-admin': ac.newRole(appRoleAccess['super-admin']),
  'bay-operator': ac.newRole(appRoleAccess['bay-operator']),
  'job-viewer': ac.newRole(appRoleAccess['job-viewer']),
  'procurement-manager': ac.newRole(appRoleAccess['procurement-manager']),
  sales: ac.newRole(appRoleAccess.sales),
};

export const authClient = createAuthClient({
  baseURL: config.authBaseUrl,
  plugins: [
    adminClient({ ac, roles: authRoles }),
    // Mirror the server `user.additionalFields` so `session.user.assistantEnabled` is typed on the client.
    inferAdditionalFields({
      user: {
        assistantEnabled: { type: 'boolean' },
        phoneNumber: { type: 'string' },
      },
    }),
  ],
});
