import { describe, expect, it } from 'vitest';

import { demoUsers } from './demo.js';

describe('demoUsers', () => {
  it('keeps seeded users on current app roles', () => {
    expect(demoUsers.map((user) => user.role).sort()).toEqual([
      'admin',
      'bay-operator',
      'bay-operator',
      'stores',
      'stores',
      'stores',
      'super-admin',
      'super-admin',
    ]);
  });

  /**
   * The stores tablet is the only seeded device, and the two stores people are what its quick-switch
   * offers. Seeding the flag without anybody to switch to would leave the grid empty.
   */
  it('seeds exactly one device, and stores people for it to attribute to', () => {
    const devices = demoUsers.filter((user) => user.isDevice === true);
    const storesPeople = demoUsers.filter((user) => user.role === 'stores' && user.isDevice !== true);

    expect(devices.map((user) => user.name)).toEqual(['Stores Tablet']);
    expect(storesPeople).toHaveLength(2);
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
