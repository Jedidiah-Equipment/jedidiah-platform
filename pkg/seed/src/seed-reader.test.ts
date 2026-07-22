import type { Db } from '@pkg/db';
import { describe, expect, it, vi } from 'vitest';

import { readExistingSnapshotTable } from './seed-reader.js';
import { snapshotTables } from './snapshot-tables.js';

describe('readExistingSnapshotTable', () => {
  it('preserves older rollout columns when only the newest optional column is absent', async () => {
    const quoteConfig = snapshotTables.find((config) => config.tableName === 'quote');
    if (!quoteConfig) throw new Error('Missing quote snapshot config');

    const select = vi.fn((projection: Record<string, unknown>) => ({
      from: () => {
        if ('cancellationReason' in projection) {
          return Promise.reject(Object.assign(new Error('column does not exist'), { code: '42703' }));
        }

        return Promise.resolve([{ hourlyRate: 975, kind: 'custom', status: 'draft' }]);
      },
    }));

    const rows = await readExistingSnapshotTable({ select } as unknown as Db, quoteConfig);

    expect(select).toHaveBeenCalledTimes(2);
    expect(select.mock.calls[1]?.[0]).not.toHaveProperty('cancellationReason');
    expect(select.mock.calls[1]?.[0]).toHaveProperty('hourlyRate');
    expect(rows).toEqual([{ cancellationReason: null, hourlyRate: 975, kind: 'custom', status: 'draft' }]);
  });
});
