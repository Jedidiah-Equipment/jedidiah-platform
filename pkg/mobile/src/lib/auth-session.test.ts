import { describe, expect, test } from 'vitest';

import type { AuthSession } from './auth';
import { getSessionRoleSlots } from './auth-session';

function sessionWithRoles(role: string | string[] | null, contractingRole: string | null): AuthSession {
  return { user: { contractingRole, role } } as AuthSession;
}

describe('getSessionRoleSlots', () => {
  test('reads both role columns, unwrapping the admin plugin array form', () => {
    expect(getSessionRoleSlots(sessionWithRoles(null, 'foreman'))).toEqual({
      contractingRole: 'foreman',
      equipmentRole: null,
    });
    expect(getSessionRoleSlots(sessionWithRoles(['sales'], null))).toEqual({
      contractingRole: null,
      equipmentRole: 'sales',
    });
  });

  test('fails closed on a role that does not parse', () => {
    expect(getSessionRoleSlots(sessionWithRoles('bogus', null))).toBeNull();
  });
});
