import { APP_PERMISSIONS, APP_ROLES, type UserAccessSummary } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import {
  canEditStage,
  canViewJob,
  canViewStage,
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
      'job-stage:read',
      'job-stage:update',
      'job:create',
      'job:read',
      'job:update',
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

  it('grants product write permissions to product editors', () => {
    expect(getRolePermissions('product-editor')).toEqual(['product:create', 'product:read', 'product:update']);
  });

  it('grants cross-cutting job write permissions to job supervisors', () => {
    expect(getRolePermissions('job-supervisor')).toEqual([
      'job-stage:read',
      'job-stage:update',
      'job:create',
      'job:read',
      'job:update',
      'product:read',
      'quote:read',
    ]);
  });

  it('grants department-scoped stage write permissions to job stage editors', () => {
    expect(getRolePermissions('job-department-manager')).toEqual(['job-stage:read', 'job-stage:update', 'job:read']);
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
    const access = createUserAccessSummary({ role: 'product-editor', userId: 'user_123' });

    expect(hasPermission(access, 'product:update')).toBe(true);
    expect(hasPermission(access, 'user:list')).toBe(false);
  });

  it('treats missing access as denied', () => {
    expect(hasPermission(null, 'product:read')).toBe(false);
    expect(hasPermission(undefined, 'product:read')).toBe(false);
  });
});

describe('job authorization policy', () => {
  const stages = ['procurement', 'supply', 'fabrication', 'paint', 'assembly'] as const;
  type Stage = (typeof stages)[number];

  it('covers the viewer profile by stage matrix', () => {
    const matrix = [
      {
        access: createUserAccessSummary({
          departments: ['paint'],
          role: 'job-department-manager',
          userId: 'user_123',
        }),
        editableStages: ['paint'],
        viewableStages: ['paint'],
      },
      {
        access: createUserAccessSummary({
          departments: ['fabrication', 'supply'],
          role: 'job-department-manager',
          userId: 'user_123',
        }),
        editableStages: ['fabrication', 'supply'],
        viewableStages: ['fabrication', 'supply'],
      },
      {
        access: createUserAccessSummary({
          role: 'job-supervisor',
          userId: 'user_123',
        }),
        editableStages: stages,
        viewableStages: stages,
      },
      {
        access: createUserAccessSummary({
          role: 'admin',
          userId: 'user_123',
        }),
        editableStages: stages,
        viewableStages: stages,
      },
      {
        access: createUserAccessSummary({
          role: 'sales',
          userId: 'user_123',
        }),
        editableStages: [],
        viewableStages: [],
      },
      {
        access: createUserAccessSummary({
          departments: [],
          role: 'job-department-manager',
          userId: 'user_123',
        }),
        editableStages: stages,
        viewableStages: stages,
      },
    ] satisfies readonly {
      access: ReturnType<typeof createUserAccessSummary>;
      editableStages: readonly Stage[];
      viewableStages: readonly Stage[];
    }[];

    for (const { access, editableStages, viewableStages } of matrix) {
      const editableStageSet = new Set<Stage>(editableStages);
      const viewableStageSet = new Set<Stage>(viewableStages);

      expect(canViewJob(access), `${access.role} can view job`).toBe(viewableStages.length > 0);

      for (const stage of stages) {
        expect(canViewStage(access, { stage }), `${access.role} can view ${stage}`).toBe(viewableStageSet.has(stage));
        expect(canEditStage(access, { stage }), `${access.role} can edit ${stage}`).toBe(editableStageSet.has(stage));
      }
    }
  });

  it('scopes single-department job stage editors to their department', () => {
    const access = createUserAccessSummary({
      departments: ['paint'],
      role: 'job-department-manager',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(true);
    expect(canViewStage(access, { stage: 'paint' })).toBe(true);
    expect(canEditStage(access, { stage: 'paint' })).toBe(true);
    expect(canViewStage(access, { stage: 'assembly' })).toBe(false);
    expect(canEditStage(access, { stage: 'assembly' })).toBe(false);
  });

  it('keeps stage detail read gated by job-stage read plus department scope', () => {
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
    expect(canViewStage(paintScopedAccess, { stage: 'fabrication' })).toBe(false);
    expect(canViewJob(jobOnlyAccess)).toBe(true);
    expect(canViewStage(jobOnlyAccess, { stage: 'fabrication' })).toBe(false);
  });

  it('scopes multi-department job stage editors to any of their departments', () => {
    const access = createUserAccessSummary({
      departments: ['fabrication', 'supply'],
      role: 'job-department-manager',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(true);
    expect(canViewStage(access, { stage: 'fabrication' })).toBe(true);
    expect(canEditStage(access, { stage: 'supply' })).toBe(true);
    expect(canViewStage(access, { stage: 'procurement' })).toBe(false);
    expect(canEditStage(access, { stage: 'paint' })).toBe(false);
  });

  it('grants job supervisors cross-cutting read/write stage access', () => {
    const access = createUserAccessSummary({
      role: 'job-supervisor',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(true);
    expect(canViewStage(access, { stage: 'assembly' })).toBe(true);
    expect(canEditStage(access, { stage: 'assembly' })).toBe(true);
  });

  it('grants admins cross-cutting read/write stage access', () => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(true);
    expect(canViewStage(access, { stage: 'procurement' })).toBe(true);
    expect(canEditStage(access, { stage: 'procurement' })).toBe(true);
  });

  it('denies users with no job role', () => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(false);
    expect(canViewStage(access, { stage: 'paint' })).toBe(false);
    expect(canEditStage(access, { stage: 'paint' })).toBe(false);
  });

  it('treats job stage editors with no selected departments as all-stage editors', () => {
    const access = createUserAccessSummary({
      departments: [],
      role: 'job-department-manager',
      userId: 'user_123',
    });

    expect(canViewJob(access)).toBe(true);
    expect(canViewStage(access, { stage: 'paint' })).toBe(true);
    expect(canEditStage(access, { stage: 'paint' })).toBe(true);
    expect(canEditStage(access, { stage: 'supply' })).toBe(true);
  });
});
