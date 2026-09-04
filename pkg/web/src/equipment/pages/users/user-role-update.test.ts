import { describe, expect, test } from 'vitest';

import { buildUserRoleUpdateData } from './user-role-update.js';

describe('buildUserRoleUpdateData', () => {
  test('does not serialize a projected Contracting role for an unchanged super-admin', () => {
    expect(
      buildUserRoleUpdateData({
        baseline: { contractingRole: 'super-admin', equipmentRole: 'super-admin' },
        value: { contractingRole: 'super-admin', equipmentRole: 'super-admin' },
      }),
    ).toEqual({});
  });

  test('canonicalizes super-admin promotion and demotion', () => {
    expect(
      buildUserRoleUpdateData({
        baseline: { contractingRole: 'foreman', equipmentRole: 'sales' },
        value: { contractingRole: 'foreman', equipmentRole: 'super-admin' },
      }),
    ).toEqual({ contractingRole: null, role: 'super-admin' });

    expect(
      buildUserRoleUpdateData({
        baseline: { contractingRole: 'super-admin', equipmentRole: 'super-admin' },
        value: { contractingRole: 'super-admin', equipmentRole: 'sales' },
      }),
    ).toEqual({ contractingRole: null, role: 'sales' });
  });
});
