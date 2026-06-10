import { describe, expect, test } from 'vitest';
import { mockSession } from '@/test/test-utils.js';

import { filterSignInEligibleSession, parseBetterAuthRole } from './session.js';

describe('parseBetterAuthRole', () => {
  test('parses supported role strings', () => {
    expect(parseBetterAuthRole('admin')).toBe('admin');
    expect(parseBetterAuthRole('procurement-manager')).toBe('procurement-manager');
    expect(parseBetterAuthRole('job-viewer')).toBe('job-viewer');
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

describe('filterSignInEligibleSession', () => {
  test('keeps sessions for roles with permissions', () => {
    const session = mockSession('job-viewer');

    expect(filterSignInEligibleSession(session)).toBe(session);
  });

  test('denies existing sessions for permissionless roles', () => {
    expect(filterSignInEligibleSession(mockSession('bay-operator'))).toBeNull();
  });
});
