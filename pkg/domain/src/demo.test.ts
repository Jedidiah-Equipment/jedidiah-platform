import { describe, expect, it } from 'vitest';

import { demoUsers } from './demo.js';

describe('demoUsers', () => {
  it('includes deterministic bay operator personnel records', () => {
    expect(demoUsers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          departments: [],
          email: 'fabrication.operator@jedidiahequipment.co.za',
          id: 'seed-operator-fabrication-user',
          role: 'bay-operator',
        }),
        expect.objectContaining({
          departments: [],
          email: 'assembly.operator@jedidiahequipment.co.za',
          id: 'seed-operator-assembly-user',
          role: 'bay-operator',
        }),
      ]),
    );
  });
});
