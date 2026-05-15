import { describe, expect, it } from 'vitest';

import { createUserAccessSummary, getRolePermissions, hasPermission } from './authorization.js';

describe('getRolePermissions', () => {
  it('grants all v1 permissions to admins', () => {
    expect(getRolePermissions('admin')).toEqual([
      'audit:read',
      'job-stage:read',
      'job-stage:update',
      'job:create',
      'job:read',
      'job:update',
      'product:create',
      'product:read',
      'product:update',
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

  it('grants read-only product access to product viewers', () => {
    expect(getRolePermissions('product-viewer')).toEqual(['product:read']);
  });

  it('grants cross-cutting job write permissions to job supervisors', () => {
    expect(getRolePermissions('job-supervisor')).toEqual([
      'job-stage:read',
      'job-stage:update',
      'job:create',
      'job:read',
      'job:update',
    ]);
  });

  it('grants department-scoped stage write permissions to job stage editors', () => {
    expect(getRolePermissions('job-stage-editor')).toEqual(['job-stage:read', 'job-stage:update', 'job:read']);
  });

  it('grants read-only job permissions to job viewers', () => {
    expect(getRolePermissions('job-viewer')).toEqual(['job-stage:read', 'job:read']);
  });
});

describe('createUserAccessSummary', () => {
  it('builds a serialized access summary', () => {
    expect(
      createUserAccessSummary({
        departments: ['paint', 'procurement'],
        role: 'product-viewer',
        userId: 'user_123',
      }),
    ).toEqual({
      departments: ['paint', 'procurement'],
      permissions: ['product:read'],
      role: 'product-viewer',
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
