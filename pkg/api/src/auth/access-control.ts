import { appRoleAccess, authorizationStatement, DEFAULT_APP_ROLE } from '@pkg/domain';
import type { AppRole } from '@pkg/schema';
import { createAccessControl } from 'better-auth/plugins/access';

export const ac = createAccessControl(authorizationStatement);

export const authRoles = {
  admin: ac.newRole(appRoleAccess.admin),
  'super-admin': ac.newRole(appRoleAccess['super-admin']),
  'bay-operator': ac.newRole(appRoleAccess['bay-operator']),
  'job-viewer': ac.newRole(appRoleAccess['job-viewer']),
  'procurement-manager': ac.newRole(appRoleAccess['procurement-manager']),
  sales: ac.newRole(appRoleAccess.sales),
  stores: ac.newRole(appRoleAccess.stores),
} as const satisfies Record<AppRole, ReturnType<typeof ac.newRole>>;

export const defaultAuthRole = DEFAULT_APP_ROLE;
