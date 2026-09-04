import { describe, expect, test } from 'vitest';
import { mockSession } from '@/test/test-utils.js';

import { filterSignInEligibleSession } from './session.js';

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
