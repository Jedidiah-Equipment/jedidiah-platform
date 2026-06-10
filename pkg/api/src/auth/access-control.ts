import { appRoleAccess, authorizationStatement, DEFAULT_APP_ROLE } from '@pkg/domain';
import { createAccessControl } from 'better-auth/plugins/access';

export const ac = createAccessControl(authorizationStatement);

export const authRoles = {
  admin: ac.newRole(appRoleAccess.admin),
  'bay-operator': ac.newRole(appRoleAccess['bay-operator']),
  'job-department-manager': ac.newRole(appRoleAccess['job-department-manager']),
  'procurement-manager': ac.newRole(appRoleAccess['procurement-manager']),
  sales: ac.newRole(appRoleAccess.sales),
};

export const defaultAuthRole = DEFAULT_APP_ROLE;
