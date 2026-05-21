import { DEPARTMENTS } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { DEFAULT_DEMO_USER_PASSWORD, demoUsers } from './demo.js';

describe('demoUsers', () => {
  it('defines unique short demo emails', () => {
    expect(new Set(demoUsers.map((user) => user.email)).size).toBe(demoUsers.length);

    for (const user of demoUsers) {
      expect(user.email).toBe(`${user.name.split(' ')[0]?.toLowerCase()}@j.com`);
      expect(user.password).toBe(DEFAULT_DEMO_USER_PASSWORD);
    }
  });

  it('defines one stage editor for each department', () => {
    const stageEditors = demoUsers.filter((user) => user.role === 'job-department-manager');

    expect(stageEditors.map((user) => user.departments[0]).sort()).toEqual([...DEPARTMENTS].sort());
  });
});
