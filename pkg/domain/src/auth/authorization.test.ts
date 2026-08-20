import { APP_PERMISSIONS, APP_ROLES } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import {
  createUserAccessSummary,
  getRolePermissions,
  hasPermission,
  isPermissionSetSignInEligible,
  isRoleSignInEligible,
  permissionDescriptions,
  permissionLabels,
  roleDescriptions,
  roleLabels,
} from './authorization.js';

describe('getRolePermissions', () => {
  it('grants Customer removal to exactly the roles that can update Customers', () => {
    for (const role of APP_ROLES) {
      expect(getRolePermissions(role).includes('customer:remove'), `role ${role}`).toBe(
        getRolePermissions(role).includes('customer:update'),
      );
    }
  });

  it('grants all admin permissions to admins', () => {
    expect(getRolePermissions('admin')).toEqual([
      'audit:read',
      'customer:create',
      'customer:read',
      'customer:remove',
      'customer:update',
      'email:send',
      'inventory:adjust',
      'inventory:build',
      'inventory:close-out',
      'inventory:count',
      'inventory:move',
      'inventory:read',
      'inventory_cost:read',
      'inventory_cost:revalue',
      'job:cancel',
      'job:create',
      'job:read',
      'job:schedule',
      'job:update',
      'job:update-calendar',
      'job_bay:read',
      'job_bay:update',
      'job_metrics:read',
      'part:read',
      'part:update',
      'product:create',
      'product:read',
      'product:update',
      'product_range:create',
      'product_range:read',
      'product_range:update',
      'product_unit:read',
      'product_unit:remove',
      'product_unit:transfer',
      'product_unit:update',
      'purchase_order:amend',
      'purchase_order:approve',
      'purchase_order:close',
      'purchase_order:create',
      'purchase_order:read',
      'purchase_order:receive',
      'purchase_order:send',
      'quote:cancel',
      'quote:create',
      'quote:read',
      'quote:update',
      'supplier:read',
      'supplier:remove',
      'supplier:update',
      'user:create',
      'user:list',
      'user:set-email',
      'user:set-password',
      'user:set-role',
      'user:update',
    ]);
  });

  it('grants super-admin every admin permission plus Feedback permissions', () => {
    const adminPermissions = getRolePermissions('admin');

    expect(getRolePermissions('super-admin')).toEqual([...adminPermissions, 'feedback:read', 'feedback:update'].sort());
    expect(adminPermissions).not.toContain('feedback:read');
    expect(adminPermissions).not.toContain('feedback:update');
  });

  // Editing a machine's VIN rewrites the identity every later Job, document, and sale inherits, so it
  // stays with the roles that own Unit identity rather than the ones that merely read Units.
  it('lets only administrators edit a Product Unit', () => {
    for (const role of ['procurement-manager', 'job-viewer', 'sales', 'stores', 'bay-operator'] as const) {
      expect(getRolePermissions(role), `role ${role}`).not.toContain('product_unit:update');
    }

    expect(getRolePermissions('admin')).toContain('product_unit:update');
    expect(getRolePermissions('super-admin')).toContain('product_unit:update');
  });

  // A hand-recorded Transfer claims who owns a machine with no Quote, price, or salesperson behind it,
  // so it stays with administrators rather than the roles that merely read Units.
  it('lets only administrators record an Ownership Transfer by hand', () => {
    for (const role of ['procurement-manager', 'job-viewer', 'sales', 'stores', 'bay-operator'] as const) {
      expect(getRolePermissions(role), `role ${role}`).not.toContain('product_unit:transfer');
    }

    expect(getRolePermissions('admin')).toContain('product_unit:transfer');
    expect(getRolePermissions('super-admin')).toContain('product_unit:transfer');
  });

  // Removing a Unit destroys the record of a minted serial, so it stays with administrators rather than
  // the roles that read Units or merely start the Jobs that mint them.
  it('lets only administrators remove a Product Unit', () => {
    for (const role of ['procurement-manager', 'job-viewer', 'sales', 'stores', 'bay-operator'] as const) {
      expect(getRolePermissions(role), `role ${role}`).not.toContain('product_unit:remove');
    }

    expect(getRolePermissions('admin')).toContain('product_unit:remove');
    expect(getRolePermissions('super-admin')).toContain('product_unit:remove');
  });

  // The whole point of the approval step: the role that drafts and sends Purchase Orders is not the
  // role that signs them off, so procurement-manager holds every other Purchase Order right but this one.
  it('lets only administrators approve a Purchase Order', () => {
    for (const role of ['procurement-manager', 'job-viewer', 'sales', 'stores', 'bay-operator'] as const) {
      expect(getRolePermissions(role), `role ${role}`).not.toContain('purchase_order:approve');
    }

    expect(getRolePermissions('admin')).toContain('purchase_order:approve');
    expect(getRolePermissions('super-admin')).toContain('purchase_order:approve');
  });

  it('grants procurement permissions to procurement managers', () => {
    expect(getRolePermissions('procurement-manager')).toEqual([
      'customer:create',
      'customer:read',
      'customer:remove',
      'customer:update',
      'inventory:adjust',
      'inventory:read',
      'inventory_cost:read',
      'inventory_cost:revalue',
      'job:read',
      'part:read',
      'part:update',
      'product:create',
      'product:read',
      'product:update',
      'product_unit:read',
      'purchase_order:amend',
      'purchase_order:close',
      'purchase_order:create',
      'purchase_order:read',
      'purchase_order:receive',
      'purchase_order:send',
      'supplier:read',
      'supplier:update',
    ]);
  });

  it('grants read-only job permissions to job viewers', () => {
    expect(getRolePermissions('job-viewer')).toEqual(['job:read', 'product_unit:read']);
  });

  it('grants Quote and email permissions to sales', () => {
    expect(getRolePermissions('sales')).toEqual([
      'email:send',
      'product_unit:read',
      'quote:create',
      'quote:read',
      'quote:update',
    ]);
  });

  it('grants physical inventory flows without cost access to Stores', () => {
    expect(getRolePermissions('stores')).toEqual([
      'inventory:adjust',
      'inventory:build',
      'inventory:close-out',
      'inventory:count',
      'inventory:move',
      'inventory:read',
      'purchase_order:read',
      'purchase_order:receive',
    ]);
  });

  it('grants no permissions to Bay Operators', () => {
    expect(getRolePermissions('bay-operator')).toEqual([]);
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
  it('derives sign-in eligibility from the permission set', () => {
    expect(isPermissionSetSignInEligible([])).toBe(false);
    expect(isPermissionSetSignInEligible(['quote:read'])).toBe(true);
  });

  it('allows roles with permissions and denies Bay Operators', () => {
    for (const role of APP_ROLES.filter((role) => role !== 'bay-operator')) {
      expect(isRoleSignInEligible(role), role).toBe(true);
    }
    expect(isRoleSignInEligible('bay-operator')).toBe(false);
  });
});

describe('createUserAccessSummary', () => {
  it('builds a serialized access summary', () => {
    expect(
      createUserAccessSummary({
        role: 'sales',
        userId: 'user_123',
      }),
    ).toEqual({
      permissions: ['email:send', 'product_unit:read', 'quote:create', 'quote:read', 'quote:update'],
      role: 'sales',
      userId: 'user_123',
    });
  });
});

describe('hasPermission', () => {
  it('checks access summaries', () => {
    const access = createUserAccessSummary({ role: 'procurement-manager', userId: 'user_123' });

    expect(hasPermission(access, 'product:update')).toBe(true);
    expect(hasPermission(access, 'user:list')).toBe(false);
  });

  it('treats missing access as denied', () => {
    expect(hasPermission(null, 'product:read')).toBe(false);
    expect(hasPermission(undefined, 'product:read')).toBe(false);
  });
});

describe('job authorization policy', () => {
  it('grants only admins the job schedule permission', () => {
    const admin = createUserAccessSummary({ role: 'admin', userId: 'user_123' });
    const viewer = createUserAccessSummary({ role: 'job-viewer', userId: 'user_123' });
    const sales = createUserAccessSummary({ role: 'sales', userId: 'user_123' });

    expect(hasPermission(admin, 'job:schedule')).toBe(true);
    expect(hasPermission(viewer, 'job:read')).toBe(true);
    expect(hasPermission(viewer, 'job:schedule')).toBe(false);
    expect(hasPermission(sales, 'job:read')).toBe(false);
    expect(hasPermission(sales, 'job:schedule')).toBe(false);
  });
});

describe('quote cancellation authorization policy', () => {
  it('grants cancellation only to administrators', () => {
    expect(getRolePermissions('admin')).toContain('quote:cancel');
    expect(getRolePermissions('super-admin')).toContain('quote:cancel');

    for (const role of ['sales', 'procurement-manager', 'job-viewer', 'stores', 'bay-operator'] as const) {
      expect(getRolePermissions(role), role).not.toContain('quote:cancel');
    }
  });
});

describe('job cancellation authorization policy', () => {
  it('grants cancellation only to administrators', () => {
    expect(getRolePermissions('admin')).toContain('job:cancel');
    expect(getRolePermissions('super-admin')).toContain('job:cancel');

    for (const role of ['sales', 'procurement-manager', 'job-viewer', 'stores', 'bay-operator'] as const) {
      expect(getRolePermissions(role), role).not.toContain('job:cancel');
    }
  });
});
