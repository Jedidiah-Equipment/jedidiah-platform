import type { Db } from '@pkg/db';
import { describe, expect, it, vi } from 'vitest';

import { getUserAccessSummary } from './user-service.js';

describe('getUserAccessSummary', () => {
  it('skips department reads for non-job roles', async () => {
    const { db, select } = createDepartmentDb([]);

    await expect(
      getUserAccessSummary({
        db,
        role: 'sales',
        userId: 'user_123',
      }),
    ).resolves.toEqual({
      departments: [],
      permissions: ['quote:create', 'quote:read', 'quote:update'],
      role: 'sales',
      userId: 'user_123',
    });
    expect(select).not.toHaveBeenCalled();
  });

  it.each(['job-department-manager', 'job-supervisor'] as const)('loads departments for %s', async (role) => {
    const { db, select } = createDepartmentDb([{ department: 'paint' }, { department: 'supply' }]);

    await expect(
      getUserAccessSummary({
        db,
        role,
        userId: 'user_123',
      }),
    ).resolves.toMatchObject({
      departments: ['paint', 'supply'],
      role,
      userId: 'user_123',
    });
    expect(select).toHaveBeenCalledTimes(1);
  });
});

function createDepartmentDb(rows: { department: string }[]) {
  const orderBy = vi.fn(async () => rows);
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return {
    db: { select } as unknown as Db,
    select,
  };
}
