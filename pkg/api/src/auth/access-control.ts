import { appRoleAccess, authorizationStatement } from '@pkg/domain';
import type { EquipmentRole } from '@pkg/schema';
import { createAccessControl } from 'better-auth/plugins/access';

export const ac = createAccessControl(authorizationStatement);

export const authRoles = {
  admin: ac.newRole(appRoleAccess.admin),
  'super-admin': ac.newRole(appRoleAccess['super-admin']),
  'bay-operator': ac.newRole(appRoleAccess['bay-operator']),
  'job-manager': ac.newRole(appRoleAccess['job-manager']),
  'job-viewer': ac.newRole(appRoleAccess['job-viewer']),
  'procurement-manager': ac.newRole(appRoleAccess['procurement-manager']),
  sales: ac.newRole(appRoleAccess.sales),
  stores: ac.newRole(appRoleAccess.stores),
} as const satisfies Record<EquipmentRole, ReturnType<typeof ac.newRole>>;
