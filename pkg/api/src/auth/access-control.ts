import { appRoleAccess, authorizationStatement, DEFAULT_APP_ROLE } from '@pkg/domain';
import { createAccessControl } from 'better-auth/plugins/access';

export const ac = createAccessControl(authorizationStatement);

export const authRoles = {
  admin: ac.newRole(appRoleAccess.admin),
  'job-stage-editor': ac.newRole(appRoleAccess['job-stage-editor']),
  'job-supervisor': ac.newRole(appRoleAccess['job-supervisor']),
  'job-viewer': ac.newRole(appRoleAccess['job-viewer']),
  'product-editor': ac.newRole(appRoleAccess['product-editor']),
  'product-viewer': ac.newRole(appRoleAccess['product-viewer']),
  sales: ac.newRole(appRoleAccess.sales),
};

export const defaultAuthRole = DEFAULT_APP_ROLE;
