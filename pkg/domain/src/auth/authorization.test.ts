import { APP_PERMISSIONS, APP_ROLES } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import { accessForRole, roleSlotsForRole } from '../testing/index.js';
import {
  createUserAccessSummary,
  getBusinessRole,
  getPermissionBusiness,
  getRolePermissions,
  hasBothBusinessAccess,
  hasBusinessAccess,
  hasPermission,
  isRoleSlotsSignInEligible,
  parseRoleSlots,
  permissionDescriptions,
  permissionLabels,
  roleDescriptions,
  roleLabels,
  tryParseRoleSlots,
} from './authorization.js';

const nonAdminRoles = APP_ROLES.filter((role) => role !== 'admin' && role !== 'super-admin');

describe('getRolePermissions', () => {
  it('grants Customer removal to exactly the roles that can update Customers', () => {
    for (const role of APP_ROLES) {
      expect(getRolePermissions(role).includes('equipment_customer:remove'), `role ${role}`).toBe(
        getRolePermissions(role).includes('equipment_customer:update'),
      );
    }
  });

  it('grants all admin permissions to admins', () => {
    expect(getRolePermissions('admin')).toEqual([
      'equipment_audit:read',
      'equipment_customer:create',
      'equipment_customer:read',
      'equipment_customer:remove',
      'equipment_customer:update',
      'equipment_email:send',
      'equipment_inventory:adjust',
      'equipment_inventory:build',
      'equipment_inventory:close-out',
      'equipment_inventory:count',
      'equipment_inventory:move',
      'equipment_inventory:read',
      'equipment_inventory_cost:read',
      'equipment_inventory_cost:revalue',
      'equipment_job:cancel',
      'equipment_job:create',
      'equipment_job:read',
      'equipment_job:schedule',
      'equipment_job:update',
      'equipment_job:update-calendar',
      'equipment_job_bay:read',
      'equipment_job_bay:update',
      'equipment_job_metrics:read',
      'equipment_part:read',
      'equipment_part:update',
      'equipment_product:create',
      'equipment_product:read',
      'equipment_product:update',
      'equipment_product_range:create',
      'equipment_product_range:read',
      'equipment_product_range:update',
      'equipment_product_unit:read',
      'equipment_product_unit:reassign',
      'equipment_product_unit:remove',
      'equipment_product_unit:transfer',
      'equipment_product_unit:update',
      'equipment_purchase_order:amend',
      'equipment_purchase_order:approve',
      'equipment_purchase_order:close',
      'equipment_purchase_order:create',
      'equipment_purchase_order:read',
      'equipment_purchase_order:receive',
      'equipment_purchase_order:send',
      'equipment_quote:cancel',
      'equipment_quote:create',
      'equipment_quote:read',
      'equipment_quote:update',
      'equipment_supplier:merge',
      'equipment_supplier:read',
      'equipment_supplier:remove',
      'equipment_supplier:update',
      'user:create',
      'user:list',
      'user:set-email',
      'user:set-password',
      'user:set-role',
      'user:update',
    ]);
  });

  it('grants super-admin every Equipment and Contracting permission plus user administration', () => {
    const adminPermissions = getRolePermissions('admin');
    const superAdminPermissions = getRolePermissions('super-admin');

    expect(superAdminPermissions).toEqual(expect.arrayContaining(adminPermissions));
    expect(superAdminPermissions).toContain('equipment_feedback:read');
    expect(superAdminPermissions).toContain('contracting_job:price');
    expect(superAdminPermissions).toContain('contracting_rate:update');
    expect(adminPermissions).not.toContain('equipment_feedback:read');
    expect(adminPermissions).not.toContain('equipment_feedback:update');
  });

  // Editing a machine's VIN rewrites the identity every later Job, document, and sale inherits, so it
  // stays with the roles that own Unit identity rather than the ones that merely read Units.
  it('lets only administrators edit a Product Unit', () => {
    for (const role of nonAdminRoles) {
      expect(getRolePermissions(role), `role ${role}`).not.toContain('equipment_product_unit:update');
    }

    expect(getRolePermissions('admin')).toContain('equipment_product_unit:update');
    expect(getRolePermissions('super-admin')).toContain('equipment_product_unit:update');
  });

  // A hand-recorded Transfer claims who owns a machine with no Quote, price, or salesperson behind it,
  // so it stays with administrators rather than the roles that merely read Units.
  it('lets only administrators record an Ownership Transfer by hand', () => {
    for (const role of nonAdminRoles) {
      expect(getRolePermissions(role), `role ${role}`).not.toContain('equipment_product_unit:transfer');
    }

    expect(getRolePermissions('admin')).toContain('equipment_product_unit:transfer');
    expect(getRolePermissions('super-admin')).toContain('equipment_product_unit:transfer');
  });

  // Removing a Unit destroys the record of a minted serial, so it stays with administrators rather than
  // the roles that read Units or merely start the Jobs that mint them.
  it('lets only administrators remove a Product Unit', () => {
    for (const role of nonAdminRoles) {
      expect(getRolePermissions(role), `role ${role}`).not.toContain('equipment_product_unit:remove');
    }

    expect(getRolePermissions('admin')).toContain('equipment_product_unit:remove');
    expect(getRolePermissions('super-admin')).toContain('equipment_product_unit:remove');
  });

  // The whole point of the approval step: the role that drafts and sends Purchase Orders is not the
  // role that signs them off, so procurement-manager holds every other Purchase Order right but this one.
  it('lets only administrators approve a Purchase Order', () => {
    for (const role of nonAdminRoles) {
      expect(getRolePermissions(role), `role ${role}`).not.toContain('equipment_purchase_order:approve');
    }

    expect(getRolePermissions('admin')).toContain('equipment_purchase_order:approve');
    expect(getRolePermissions('super-admin')).toContain('equipment_purchase_order:approve');
  });

  it('grants procurement permissions to procurement managers', () => {
    expect(getRolePermissions('procurement-manager')).toEqual([
      'equipment_customer:create',
      'equipment_customer:read',
      'equipment_customer:remove',
      'equipment_customer:update',
      'equipment_inventory:adjust',
      'equipment_inventory:read',
      'equipment_inventory_cost:read',
      'equipment_inventory_cost:revalue',
      'equipment_job:read',
      'equipment_part:read',
      'equipment_part:update',
      'equipment_product:create',
      'equipment_product:read',
      'equipment_product:update',
      'equipment_product_unit:read',
      'equipment_purchase_order:amend',
      'equipment_purchase_order:close',
      'equipment_purchase_order:create',
      'equipment_purchase_order:read',
      'equipment_purchase_order:receive',
      'equipment_purchase_order:send',
      'equipment_quote:create',
      'equipment_quote:read',
      'equipment_quote:update',
      'equipment_supplier:merge',
      'equipment_supplier:read',
      'equipment_supplier:update',
    ]);
  });

  it('grants read-only job permissions to job viewers', () => {
    expect(getRolePermissions('job-viewer')).toEqual(['equipment_job:read', 'equipment_product_unit:read']);
  });

  it('grants Job reads and updates to job managers', () => {
    expect(getRolePermissions('job-manager')).toEqual([
      'equipment_job:read',
      'equipment_job:update',
      'equipment_product_unit:read',
    ]);
  });

  it('grants Quote and email permissions to sales', () => {
    expect(getRolePermissions('sales')).toEqual([
      'equipment_email:send',
      'equipment_product_unit:read',
      'equipment_quote:create',
      'equipment_quote:read',
      'equipment_quote:update',
    ]);
  });

  it('grants physical inventory flows without cost access to Stores', () => {
    expect(getRolePermissions('stores')).toEqual([
      'equipment_inventory:adjust',
      'equipment_inventory:build',
      'equipment_inventory:close-out',
      'equipment_inventory:count',
      'equipment_inventory:move',
      'equipment_inventory:read',
      'equipment_purchase_order:read',
      'equipment_purchase_order:receive',
    ]);
  });

  it('grants no permissions to Bay Operators', () => {
    expect(getRolePermissions('bay-operator')).toEqual([]);
  });

  it('declares the contracting role matrix without crossing its money or fleet boundaries', () => {
    expect(getRolePermissions('contracting-manager')).toEqual([
      'contracting_breakdown:read',
      'contracting_breakdown:report',
      'contracting_breakdown:update',
      'contracting_gap:resolve',
      'contracting_job:assign',
      'contracting_job:cancel',
      'contracting_job:complete',
      'contracting_job:create',
      'contracting_job:read',
      'contracting_job:update',
      'contracting_machine:read',
      'contracting_machine:update',
      'contracting_reading:capture',
      'contracting_reading:update',
      'contracting_report:read',
      'contracting_service:read',
      'contracting_service:update',
    ]);
    expect(getRolePermissions('workshop-manager')).toEqual([
      'contracting_breakdown:read',
      'contracting_breakdown:report',
      'contracting_breakdown:update',
      'contracting_job:read',
      'contracting_machine:read',
      'contracting_report:read',
      'contracting_service:read',
      'contracting_service:update',
    ]);
    expect(getRolePermissions('foreman')).toEqual([
      'contracting_assignment:update-own',
      'contracting_breakdown:report',
      'contracting_job:read-own',
      'contracting_reading:capture',
    ]);
    expect(getRolePermissions('contracting-invoicing')).toEqual([
      'contracting_invoice:update',
      'contracting_job:read-priced',
    ]);
    expect(getRolePermissions('driver')).toEqual([]);
    expect(getRolePermissions('mechanic')).toEqual([]);
  });
});

describe('roleLabels', () => {
  it('labels every app role', () => {
    expect(Object.keys(roleLabels).sort()).toEqual([...APP_ROLES].sort());
  });
});

describe('roleDescriptions', () => {
  it('describes every app role', () => {
    expect(Object.keys(roleDescriptions).sort()).toEqual([...APP_ROLES].sort());
  });
});

describe('permissionLabels', () => {
  it('labels every app permission', () => {
    expect(Object.keys(permissionLabels).sort()).toEqual([...APP_PERMISSIONS].sort());
  });
});

describe('permissionDescriptions', () => {
  it('describes every app permission', () => {
    expect(Object.keys(permissionDescriptions).sort()).toEqual([...APP_PERMISSIONS].sort());
  });
});

describe('sign-in eligibility', () => {
  it('allows roles with permissions and denies permissionless roles', () => {
    for (const role of APP_ROLES.filter((role) => !['bay-operator', 'driver', 'mechanic'].includes(role))) {
      expect(isRoleSlotsSignInEligible(roleSlotsForRole(role)), role).toBe(true);
    }
    expect(isRoleSlotsSignInEligible({ contractingRole: null, equipmentRole: 'bay-operator' })).toBe(false);
    expect(isRoleSlotsSignInEligible({ contractingRole: 'driver', equipmentRole: null })).toBe(false);
    expect(isRoleSlotsSignInEligible({ contractingRole: 'mechanic', equipmentRole: null })).toBe(false);
    expect(isRoleSlotsSignInEligible({ contractingRole: null, equipmentRole: null })).toBe(false);
  });

  it('allows sign-in when either role slot grants permissions', () => {
    expect(isRoleSlotsSignInEligible({ contractingRole: 'foreman', equipmentRole: null })).toBe(true);
    expect(isRoleSlotsSignInEligible({ contractingRole: 'driver', equipmentRole: 'bay-operator' })).toBe(false);
  });
});

describe('roleSlotsForRole', () => {
  it('places every role in exactly one slot', () => {
    expect(roleSlotsForRole('sales')).toEqual({ contractingRole: null, equipmentRole: 'sales' });
    expect(roleSlotsForRole('foreman')).toEqual({ contractingRole: 'foreman', equipmentRole: null });
    expect(roleSlotsForRole('super-admin')).toEqual({ contractingRole: null, equipmentRole: 'super-admin' });
  });
});

describe('parseRoleSlots', () => {
  it('reads the stored slots, unwrapping the Better Auth role array', () => {
    expect(parseRoleSlots({ contractingRole: 'foreman', role: null })).toEqual({
      contractingRole: 'foreman',
      equipmentRole: null,
    });
    expect(parseRoleSlots({ role: ['sales'] })).toEqual({ contractingRole: null, equipmentRole: 'sales' });
    expect(() => parseRoleSlots({ contractingRole: 'super-admin', role: null })).toThrow();
    expect(tryParseRoleSlots({ role: 'bogus' })).toBeNull();
  });
});

describe('createUserAccessSummary', () => {
  it('builds a serialized access summary', () => {
    expect(accessForRole('sales', 'user_123')).toEqual({
      contractingRole: null,
      equipmentRole: 'sales',
      permissions: [
        'equipment_email:send',
        'equipment_product_unit:read',
        'equipment_quote:create',
        'equipment_quote:read',
        'equipment_quote:update',
      ],
      userId: 'user_123',
    });
  });

  it('combines two role slots', () => {
    const dualAccess = createUserAccessSummary({
      contractingRole: 'contracting-invoicing',
      equipmentRole: 'sales',
      userId: 'user_123',
    });
    expect(dualAccess.permissions).toEqual(
      expect.arrayContaining(['equipment_quote:read', 'contracting_job:read-priced', 'contracting_invoice:update']),
    );
  });
});

describe('business access', () => {
  it('derives each business boundary from role presence', () => {
    const contractingOnly = accessForRole('foreman', 'user_789');

    expect(hasBusinessAccess(contractingOnly, 'contracting')).toBe(true);
    expect(hasBusinessAccess(contractingOnly, 'equipment')).toBe(false);
    expect(hasBothBusinessAccess(contractingOnly)).toBe(false);
    expect(hasBusinessAccess(null, 'equipment')).toBe(false);
  });

  it('spans both businesses for a super-admin stored in the equipment slot', () => {
    const superAdmin = accessForRole('super-admin', 'user_456');

    expect(superAdmin.contractingRole).toBeNull();
    expect(getBusinessRole(superAdmin, 'contracting')).toBe('super-admin');
    expect(getBusinessRole(superAdmin, 'equipment')).toBe('super-admin');
    expect(hasBothBusinessAccess(superAdmin)).toBe(true);
    expect(superAdmin.permissions).toEqual(expect.arrayContaining(['contracting_rate:update', 'user:set-role']));
  });

  it('assigns permissions to the business that owns them', () => {
    expect(getPermissionBusiness('contracting_job:read')).toBe('contracting');
    expect(getPermissionBusiness('equipment_job:read')).toBe('equipment');
    expect(getPermissionBusiness('user:set-role')).toBe('equipment');
  });
});

describe('hasPermission', () => {
  it('checks access summaries', () => {
    const access = accessForRole('procurement-manager', 'user_123');

    expect(hasPermission(access, 'equipment_product:update')).toBe(true);
    expect(hasPermission(access, 'user:list')).toBe(false);
  });

  it('treats missing access as denied', () => {
    expect(hasPermission(null, 'equipment_product:read')).toBe(false);
    expect(hasPermission(undefined, 'equipment_product:read')).toBe(false);
  });
});

describe('job authorization policy', () => {
  it('grants only admins the job schedule permission', () => {
    const admin = accessForRole('admin', 'user_123');
    const viewer = accessForRole('job-viewer', 'user_123');
    const sales = accessForRole('sales', 'user_123');

    expect(hasPermission(admin, 'equipment_job:schedule')).toBe(true);
    expect(getRolePermissions('super-admin')).toContain('equipment_job:schedule');
    for (const role of nonAdminRoles) {
      expect(getRolePermissions(role), role).not.toContain('equipment_job:schedule');
    }
    expect(hasPermission(viewer, 'equipment_job:read')).toBe(true);
    expect(hasPermission(sales, 'equipment_job:read')).toBe(false);
  });
});

describe('quote cancellation authorization policy', () => {
  it('grants cancellation only to administrators', () => {
    expect(getRolePermissions('admin')).toContain('equipment_quote:cancel');
    expect(getRolePermissions('super-admin')).toContain('equipment_quote:cancel');

    for (const role of nonAdminRoles) {
      expect(getRolePermissions(role), role).not.toContain('equipment_quote:cancel');
    }
  });
});

describe('job cancellation authorization policy', () => {
  it('grants cancellation only to administrators', () => {
    expect(getRolePermissions('admin')).toContain('equipment_job:cancel');
    expect(getRolePermissions('super-admin')).toContain('equipment_job:cancel');

    for (const role of nonAdminRoles) {
      expect(getRolePermissions(role), role).not.toContain('equipment_job:cancel');
    }
  });
});
