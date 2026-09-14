import { getPermissionBusiness, getRolePermissions } from '@pkg/domain';
import {
  APP_PERMISSIONS,
  type AppPermission,
  type AppRole,
  type Business,
  CONTRACTING_ROLES,
  EQUIPMENT_ROLES,
} from '@pkg/schema';

export type PermissionMatrixModel = {
  permissions: AppPermission[];
  permissionsByRole: Map<AppRole, ReadonlySet<AppPermission>>;
  roles: AppRole[];
};

/**
 * The grid for one business: its permissions against its roles. super-admin is an equipment role
 * by storage but spans both (ADR 0017), so Contracting shows it beside its own roles.
 */
export function buildPermissionMatrix(business: Business): PermissionMatrixModel {
  const roles: AppRole[] = business === 'equipment' ? [...EQUIPMENT_ROLES] : ['super-admin', ...CONTRACTING_ROLES];

  return {
    permissions: APP_PERMISSIONS.filter((permission) => getPermissionBusiness(permission) === business),
    permissionsByRole: new Map(roles.map((role) => [role, new Set(getRolePermissions(role))])),
    roles,
  };
}
