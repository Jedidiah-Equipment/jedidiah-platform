import { describe, expect, it } from 'vitest';

import { AppPermission, AppRole, Department, UserAccessSummary, UserSummary } from './authorization.js';

describe('Department', () => {
  it('accepts supported job departments', () => {
    expect(Department.parse('procurement')).toBe('procurement');
    expect(Department.parse('fabrication')).toBe('fabrication');
    expect(Department.parse('paint')).toBe('paint');
    expect(Department.parse('assembly')).toBe('assembly');
    expect(Department.parse('dispatch')).toBe('dispatch');
  });

  it('rejects unsupported department values', () => {
    expect(() => Department.parse('engineering')).toThrow();
  });
});

describe('AppRole', () => {
  it('accepts job roles', () => {
    expect(AppRole.parse('job-supervisor')).toBe('job-supervisor');
    expect(AppRole.parse('job-stage-editor')).toBe('job-stage-editor');
    expect(AppRole.parse('job-viewer')).toBe('job-viewer');
  });
});

describe('AppPermission', () => {
  it('accepts job and department assignment permissions', () => {
    expect(AppPermission.parse('job:read')).toBe('job:read');
    expect(AppPermission.parse('job:create')).toBe('job:create');
    expect(AppPermission.parse('job:update')).toBe('job:update');
    expect(AppPermission.parse('job-stage:read')).toBe('job-stage:read');
    expect(AppPermission.parse('job-stage:update')).toBe('job-stage:update');
    expect(AppPermission.parse('user:assign-departments')).toBe('user:assign-departments');
  });
});

describe('UserAccessSummary', () => {
  it('requires department memberships', () => {
    expect(() =>
      UserAccessSummary.parse({
        permissions: [],
        role: 'product-viewer',
        userId: 'user_123',
      }),
    ).toThrow();

    expect(
      UserAccessSummary.parse({
        departments: ['assembly'],
        permissions: [],
        role: 'product-viewer',
        userId: 'user_123',
      }).departments,
    ).toEqual(['assembly']);
  });
});

describe('UserSummary', () => {
  it('requires department memberships', () => {
    expect(() =>
      UserSummary.parse({
        email: 'user@example.com',
        emailVerified: true,
        id: 'user_123',
        name: 'User Example',
        role: 'product-viewer',
      }),
    ).toThrow();

    expect(
      UserSummary.parse({
        departments: ['dispatch'],
        email: 'user@example.com',
        emailVerified: true,
        id: 'user_123',
        name: 'User Example',
        role: 'product-viewer',
      }).departments,
    ).toEqual(['dispatch']);
  });
});
