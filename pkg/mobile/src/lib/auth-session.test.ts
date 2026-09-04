import { describe, expect, test } from 'vitest';

import type { AuthSession } from './auth';
import { getSessionBusinessAccess } from './auth-session';

function sessionWithRoles(role: string | null, contractingRole: string | null): AuthSession {
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
  });
});
