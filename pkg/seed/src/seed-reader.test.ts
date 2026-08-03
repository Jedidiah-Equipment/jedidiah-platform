import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Db } from '@pkg/db';
import { describe, expect, it, vi } from 'vitest';

import { downloadSnapshotObjectIfMissing, readExistingSnapshotTable } from './seed-reader.js';
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

        return Promise.resolve([{ kind: 'custom', status: 'draft' }]);
      },
    }));

    const rows = await readExistingSnapshotTable({ select } as unknown as Db, quoteConfig);

    expect(select).toHaveBeenCalledTimes(2);
    expect(select.mock.calls[1]?.[0]).not.toHaveProperty('cancellationReason');
    expect(rows).toEqual([{ cancellationReason: null, kind: 'custom', status: 'draft' }]);
  });
});

describe('downloadSnapshotObjectIfMissing', () => {
  it('skips the remote download when the local object already exists', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'seed-reader-'));
    const destination = pathToFileURL(path.join(directory, 'nested', 'image.png'));
    const download = vi.fn(async () => new Uint8Array([4, 5, 6]));

    try {
      await mkdir(new URL('.', destination), { recursive: true });
      await writeFile(destination, new Uint8Array([1, 2, 3]));

      await expect(downloadSnapshotObjectIfMissing(destination, download)).resolves.toBe('cached');
      expect(download).not.toHaveBeenCalled();
      await expect(readFile(destination)).resolves.toEqual(Buffer.from([1, 2, 3]));
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it('downloads and stores an object that is not cached', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'seed-reader-'));
    const destination = pathToFileURL(path.join(directory, 'nested', 'image.png'));
    const download = vi.fn(async () => new Uint8Array([4, 5, 6]));

    try {
      await expect(downloadSnapshotObjectIfMissing(destination, download)).resolves.toBe('downloaded');
      expect(download).toHaveBeenCalledOnce();
      await expect(readFile(destination)).resolves.toEqual(Buffer.from([4, 5, 6]));
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
