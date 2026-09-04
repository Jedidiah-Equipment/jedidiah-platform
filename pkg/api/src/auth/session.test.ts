import { describe, expect, test } from 'vitest';
import { mockSession } from '@/test/test-utils.js';

import { filterSignInEligibleSession, parseBetterAuthRole, parseBetterAuthRoleSlots } from './session.js';

describe('parseBetterAuthRole', () => {
  test('parses supported role strings', () => {
    expect(parseBetterAuthRole('admin')).toBe('admin');
    expect(parseBetterAuthRole('procurement-manager')).toBe('procurement-manager');
    expect(parseBetterAuthRole('job-viewer')).toBe('job-viewer');
    expect(parseBetterAuthRole('stores')).toBe('stores');
    expect(parseBetterAuthRole('bay-operator')).toBe('bay-operator');
  });

  test('accepts the first role from better-auth array-shaped values', () => {
    expect(parseBetterAuthRole(['admin', 'admin'])).toBe('admin');
  });

  test('rejects unsupported role strings', () => {
    expect(() => parseBetterAuthRole('manager')).toThrow();
  });

  test('rejects non-string role values', () => {
    expect(() => parseBetterAuthRole({ role: 'admin' })).toThrow();
  });
});

describe('parseBetterAuthRoleSlots', () => {
  test('parses independent optional roles and expands the spanning super-admin', () => {
    expect(parseBetterAuthRoleSlots({ contractingRole: 'foreman', role: null })).toEqual({
      contractingRole: 'foreman',
      equipmentRole: null,
    });
    expect(parseBetterAuthRoleSlots({ contractingRole: null, role: 'super-admin' })).toEqual({
      contractingRole: 'super-admin',
      equipmentRole: 'super-admin',
    });
  });
});

describe('filterSignInEligibleSession', () => {
  test('keeps sessions for roles with permissions', () => {
    const session = mockSession('job-viewer');

    expect(filterSignInEligibleSession(session)).toBe(session);
  });

  test('denies existing sessions for permissionless roles', () => {
    expect(filterSignInEligibleSession(mockSession('bay-operator'))).toBeNull();
  });

  test('keeps a Contracting-only session when its role grants permissions', () => {
    const session = mockSession(null);
    session.user.contractingRole = 'foreman';

    expect(filterSignInEligibleSession(session)).toBe(session);
  });
});
