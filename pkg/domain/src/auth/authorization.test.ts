import { APP_PERMISSIONS, APP_ROLES, type UserAccessSummary } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import {
  canScheduleBay,
  canViewJob,
  createUserAccessSummary,
  getRolePermissions,
  hasPermission,
  permissionDescriptions,
  permissionLabels,
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
      'user:assign-departments',
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

  it('grants department-scoped schedule permissions to job department managers', () => {
    expect(getRolePermissions('job-department-manager')).toEqual(['job:read', 'job:schedule']);
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

describe('createUserAccessSummary', () => {
  it('builds a serialized access summary', () => {
    expect(
      createUserAccessSummary({
        departments: ['paint', 'procurement'],
        role: 'sales',
        userId: 'user_123',
      }),
    ).toEqual({
      departments: ['paint', 'procurement'],
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
  const departments = ['procurement', 'supply', 'fabrication', 'paint', 'assembly'] as const;
  type Department = (typeof departments)[number];

  it('covers the scheduling profile by department matrix', () => {
    const matrix = [
      {
        access: createUserAccessSummary({
          departments: ['paint'],
          role: 'job-department-manager',
          userId: 'user_123',
        }),
        schedulableDepartments: ['paint'],
      },
      {
        access: createUserAccessSummary({
          departments: ['fabrication', 'supply'],
          role: 'job-department-manager',
          userId: 'user_123',
        }),
        schedulableDepartments: ['fabrication', 'supply'],
      },
      {
        access: createUserAccessSummary({
          role: 'admin',
          userId: 'user_123',
        }),
        schedulableDepartments: departments,
      },
      {
        access: createUserAccessSummary({
          role: 'sales',
          userId: 'user_123',
        }),
        schedulableDepartments: [],
      },
      {
        access: createUserAccessSummary({
          departments: [],
          role: 'job-department-manager',
          userId: 'user_123',
        }),
        schedulableDepartments: departments,
      },
    ] satisfies readonly {
      access: ReturnType<typeof createUserAccessSummary>;
      schedulableDepartments: readonly Department[];
    }[];

    for (const { access, schedulableDepartments } of matrix) {
      const schedulableDepartmentSet = new Set<Department>(schedulableDepartments);

      expect(canViewJob(access), `${access.role} can view job`).toBe(access.permissions.includes('job:read'));

      for (const department of departments) {
        expect(canScheduleBay(access, department), `${access.role} can schedule ${department}`).toBe(
          schedulableDepartmentSet.has(department),
        );
      }
    }
  });

  it('scopes single-department job department managers to their department', () => {
    const access = createUserAccessSummary({
      departments: ['paint'],
      role: 'job-department-manager',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(true);
    expect(canScheduleBay(access, 'paint')).toBe(true);
    expect(canScheduleBay(access, 'assembly')).toBe(false);
  });

  it('keeps scheduling gated by job schedule plus department scope', () => {
    const paintScopedAccess = createUserAccessSummary({
      departments: ['paint'],
      role: 'job-department-manager',
      userId: 'user_123',
    });
    const jobOnlyAccess = {
      departments: [],
      permissions: ['job:read'],
      role: 'sales',
      userId: 'user_456',
    } satisfies UserAccessSummary;

    expect(canViewJob(paintScopedAccess)).toBe(true);
    expect(canScheduleBay(paintScopedAccess, 'fabrication')).toBe(false);
    expect(canViewJob(jobOnlyAccess)).toBe(true);
    expect(canScheduleBay(jobOnlyAccess, 'fabrication')).toBe(false);
  });

  it('scopes multi-department job department managers to any of their departments', () => {
    const access = createUserAccessSummary({
      departments: ['fabrication', 'supply'],
      role: 'job-department-manager',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(true);
    expect(canScheduleBay(access, 'fabrication')).toBe(true);
    expect(canScheduleBay(access, 'supply')).toBe(true);
    expect(canScheduleBay(access, 'procurement')).toBe(false);
    expect(canScheduleBay(access, 'paint')).toBe(false);
  });

  it('grants admins cross-cutting schedule access', () => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(true);
    expect(canScheduleBay(access, 'procurement')).toBe(true);
  });

  it('denies users with no job role', () => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(false);
    expect(canScheduleBay(access, 'paint')).toBe(false);
  });

  it('treats job department managers with no selected departments as all-department schedulers', () => {
    const access = createUserAccessSummary({
      departments: [],
      role: 'job-department-manager',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(true);
    expect(canScheduleBay(access, 'paint')).toBe(true);
    expect(canScheduleBay(access, 'supply')).toBe(true);
  });
});
