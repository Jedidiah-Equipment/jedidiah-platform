import { describe, expect, it } from 'vitest';

import { demoUsers } from './demo.js';

describe('demoUsers', () => {
  it('keeps seeded users on current app roles', () => {
    expect(demoUsers.map((user) => user.role).sort()).toEqual([
      'admin',
      'bay-operator',
      'bay-operator',
      'sales',
      'super-admin',
      'super-admin',
    ]);
  });
});
