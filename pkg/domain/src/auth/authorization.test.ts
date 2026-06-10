import { APP_PERMISSIONS, APP_ROLES, type UserAccessSummary } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import {
  canScheduleBay,
  canViewJob,
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
      'quote:create',
      'quote:read',
      'quote:update',
      'supplier:read',
      'supplier:update',
      'user:create',
      'user:list',
      'user:set-password',
      'user:set-role',
      'user:update',
    ]);
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

  it('allows every current app role to sign in', () => {
    for (const role of APP_ROLES) {
      expect(isRoleSignInEligible(role), role).toBe(true);
    }
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
  it('grants admins schedule access to every bay', () => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(true);
    expect(canScheduleBay(access)).toBe(true);
  });

  it('keeps job viewers read-only', () => {
    const access = createUserAccessSummary({
      role: 'job-viewer',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(true);
    expect(canScheduleBay(access)).toBe(false);
  });

  it('keeps scheduling gated by the job schedule permission', () => {
    const jobOnlyAccess = {
      permissions: ['job:read'],
      role: 'sales',
      userId: 'user_456',
    } satisfies UserAccessSummary;

    expect(canViewJob(jobOnlyAccess)).toBe(true);
    expect(canScheduleBay(jobOnlyAccess)).toBe(false);
  });

  it('denies users with no job role', () => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(false);
    expect(canScheduleBay(access)).toBe(false);
  });

  it('treats missing access as denied', () => {
    expect(canScheduleBay(null)).toBe(false);
    expect(canScheduleBay(undefined)).toBe(false);
  });
});
