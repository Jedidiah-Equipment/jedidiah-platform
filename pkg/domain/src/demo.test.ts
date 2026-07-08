import { describe, expect, it } from 'vitest';

import { demoUsers } from './demo.js';

describe('demoUsers', () => {
  it('keeps seeded users on current app roles', () => {
    expect(demoUsers.map((user) => user.role).sort()).toEqual([
      'admin',
      'bay-operator',
      'bay-operator',
      'super-admin',
      'super-admin',
    ]);
  });

  it('does not seed the retired Sue Smith demo account', () => {
    expect(demoUsers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'seed-sue-user',
          email: 'sales@jedidiahequipment.co.za',
        }),
      ]),
    );
  });
});
