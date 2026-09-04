import { describe, expect, test } from 'vitest';

import type { AuthSession } from './auth';
import { getSessionBusinessAccess, isSessionSignInEligible } from './auth-session';

function sessionWithRoles(role: string | string[] | null, contractingRole: string | null): AuthSession {
  return { user: { contractingRole, role } } as AuthSession;
}

describe('getSessionBusinessAccess', () => {
  test('derives each business from role presence and projects super-admin', () => {
    expect(getSessionBusinessAccess(sessionWithRoles(null, 'foreman'))).toEqual({
      contracting: true,
      equipment: false,
    });
    expect(getSessionBusinessAccess(sessionWithRoles('sales', null))).toEqual({
      contracting: false,
      equipment: true,
    });
    expect(getSessionBusinessAccess(sessionWithRoles('super-admin', null))).toEqual({
      contracting: true,
      equipment: true,
    });
    expect(getSessionBusinessAccess(sessionWithRoles(['sales'], null))).toEqual({
      contracting: false,
      equipment: true,
    });
  });
});

describe('isSessionSignInEligible', () => {
  test('requires a role that grants permissions, not merely a business', () => {
    expect(isSessionSignInEligible(sessionWithRoles('sales', null))).toBe(true);
    expect(isSessionSignInEligible(sessionWithRoles(null, 'foreman'))).toBe(true);
    expect(isSessionSignInEligible(sessionWithRoles(null, 'driver'))).toBe(false);
    expect(isSessionSignInEligible(sessionWithRoles('bay-operator', 'mechanic'))).toBe(false);
    expect(isSessionSignInEligible(sessionWithRoles(null, null))).toBe(false);
    expect(isSessionSignInEligible(sessionWithRoles('bogus', null))).toBe(false);
  });
});
