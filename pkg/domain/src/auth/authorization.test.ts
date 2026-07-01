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
  it('grants all v1 permissions to admins', () => {
    expect(getRolePermissions('admin')).toEqual([
      'audit:read',
      'customer:create',
      'customer:read',
      'customer:update',
      'job:create',
      'job:read',
      'job:schedule',
      'job:update',
      'job:update-calendar',
      'job_bay:read',
      'job_bay:update',
      'part:read',
      'part:update',
      'product:create',
      'product:read',
      'product:update',
      'product_range:create',
      'product_range:read',
      'product_range:update',
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

  it('grants procurement permissions to procurement managers', () => {
    expect(getRolePermissions('procurement-manager')).toEqual([
      'customer:create',
      'customer:read',
      'customer:update',
      'job:read',
      'part:read',
      'part:update',
      'product:create',
      'product:read',
      'product:update',
      'supplier:read',
      'supplier:update',
    ]);
  });

  it('grants read-only job permissions to job viewers', () => {
    expect(getRolePermissions('job-viewer')).toEqual(['job:read']);
  });

  it('grants quote-only permissions to sales', () => {
    expect(getRolePermissions('sales')).toEqual(['quote:create', 'quote:read', 'quote:update']);
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
      permissions: ['quote:create', 'quote:read', 'quote:update'],
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
