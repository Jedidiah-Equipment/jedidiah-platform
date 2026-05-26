import { describe, expect, it } from 'vitest';

import {
  AppPermission,
  AppRole,
  Department,
  UserAccessSummary,
  UserAccount,
  UserPassword,
  UserSummary,
} from './authorization.js';

describe('Department', () => {
  it('accepts supported job departments', () => {
    expect(Department.parse('procurement')).toBe('procurement');
    expect(Department.parse('fabrication')).toBe('fabrication');
    expect(Department.parse('paint')).toBe('paint');
    expect(Department.parse('assembly')).toBe('assembly');
    expect(Department.parse('supply')).toBe('supply');
  });

  it('rejects unsupported department values', () => {
    expect(() => Department.parse('engineering')).toThrow();
  });
});

describe('AppRole', () => {
  it('accepts job roles', () => {
    expect(AppRole.parse('job-supervisor')).toBe('job-supervisor');
    expect(AppRole.parse('job-department-manager')).toBe('job-department-manager');
    expect(AppRole.parse('sales')).toBe('sales');
  });
});

describe('AppPermission', () => {
  it('accepts app permissions', () => {
    expect(AppPermission.parse('job:read')).toBe('job:read');
    expect(AppPermission.parse('job:create')).toBe('job:create');
    expect(AppPermission.parse('job:update')).toBe('job:update');
    expect(AppPermission.parse('job-stage:read')).toBe('job-stage:read');
    expect(AppPermission.parse('job-stage:update')).toBe('job-stage:update');
    expect(AppPermission.parse('supplier:read')).toBe('supplier:read');
    expect(AppPermission.parse('supplier:update')).toBe('supplier:update');
    expect(AppPermission.parse('user:assign-departments')).toBe('user:assign-departments');
  });
});

describe('UserAccessSummary', () => {
  it('requires department memberships', () => {
    expect(() =>
      UserAccessSummary.parse({
        permissions: [],
        role: 'sales',
        userId: 'user_123',
      }),
    ).toThrow();

    expect(
      UserAccessSummary.parse({
        departments: ['assembly'],
        permissions: [],
        role: 'sales',
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
        role: 'sales',
      }),
    ).toThrow();

    expect(
      UserSummary.parse({
        departments: ['supply'],
        email: 'user@example.com',
        emailVerified: true,
        id: 'user_123',
        name: 'User Example',
        role: 'sales',
      }).departments,
    ).toEqual(['supply']);
  });
});

describe('UserAccount', () => {
  it('parses a user without department memberships', () => {
    expect(
      UserAccount.parse({
        email: 'user@example.com',
        emailVerified: true,
        id: 'user_123',
        name: 'User Example',
        role: 'sales',
      }),
    ).toEqual({
      email: 'user@example.com',
      emailVerified: true,
      id: 'user_123',
      name: 'User Example',
      role: 'sales',
    });
  });
});

describe('UserPassword', () => {
  it('accepts non-empty passwords', () => {
    expect(UserPassword.parse('123')).toBe('123');
  });

  it('rejects empty passwords', () => {
    expect(() => UserPassword.parse('')).toThrow();
  });
});
