import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Db } from '@pkg/db';
import { describe, expect, it, vi } from 'vitest';
import { legacyPartCategoryId } from './legacy-part-categories.js';
import { downloadSnapshotObjectIfMissing, readExistingSnapshotTable } from './seed-reader.js';
import { snapshotTables } from './snapshot-tables.js';

describe('readExistingSnapshotTable', () => {
  it('preserves older rollout columns when only the newest optional column is absent', async () => {
    const quoteConfig = snapshotTables.find((config) => config.tableName === 'quote');
    if (!quoteConfig) throw new Error('Missing quote snapshot config');

    const select = vi.fn((projection: Record<string, unknown>) => ({
      from: () => {
        if ('deliveryTerms' in projection) {
          return Promise.reject(Object.assign(new Error('column does not exist'), { code: '42703' }));
        }

        return Promise.resolve([{ cancellationReason: null, deliveryPrice: 350, kind: 'custom', status: 'draft' }]);
      },
    }));

    const rows = await readExistingSnapshotTable({ select } as unknown as Db, quoteConfig);

    expect(select).toHaveBeenCalledTimes(2);
    expect(select.mock.calls[1]?.[0]).not.toHaveProperty('deliveryTerms');
    expect(select.mock.calls[1]?.[0]).toHaveProperty('cancellationReason');
    expect(rows).toEqual([
      {
        cancellationReason: null,
        deliveryPrice: 350,
        deliveryTerms: 'additional_charge',
        kind: 'custom',
        status: 'draft',
      },
    ]);
  });

  it('preserves an independent Quote salesperson flag when available and falls back before deployment', async () => {
    const userConfig = snapshotTables.find((config) => config.tableName === 'user');
    if (!userConfig) throw new Error('Missing user snapshot config');

    const deployed = {
      select: () => ({ from: async () => [{ role: 'sales', quoteSalesperson: false }] }),
    } as unknown as Db;
    expect((await readExistingSnapshotTable(deployed, userConfig))[0]?.quoteSalesperson).toBe(false);

    const preDeployment = {
      select: (projection: Record<string, unknown>) => ({
        from: async () => {
          if ('quoteSalesperson' in projection) {
            throw Object.assign(new Error('column does not exist'), { code: '42703' });
          }
          return [{ role: 'sales' }];
        },
      }),
    } as unknown as Db;
    expect((await readExistingSnapshotTable(preDeployment, userConfig))[0]?.quoteSalesperson).toBe(true);
  });

  it('reads current local columns while continuing to omit credential password hashes', async () => {
    const userConfig = snapshotTables.find((config) => config.tableName === 'user');
    const accountConfig = snapshotTables.find((config) => config.tableName === 'account');
    if (!userConfig || !accountConfig) throw new Error('Missing auth snapshot config');

    const projections: Record<string, unknown>[] = [];
    const database = {
      select: (projection: Record<string, unknown>) => {
        projections.push(projection);
        return { from: async () => [{ assistantEnabled: false, providerId: 'credential' }] };
      },
    } as unknown as Db;

    await readExistingSnapshotTable(database, userConfig, { currentSchema: true });
    await readExistingSnapshotTable(database, accountConfig, { currentSchema: true });

    expect(projections[0]).toHaveProperty('assistantEnabled');
    expect(projections[1]).not.toHaveProperty('password');
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

  it('leaves the destination absent when the remote object is missing', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'seed-reader-'));
    const destination = pathToFileURL(path.join(directory, 'nested', 'image.png'));
    const download = vi.fn(async () => null);

    try {
      await expect(downloadSnapshotObjectIfMissing(destination, download)).resolves.toBe('missing');
      expect(download).toHaveBeenCalledOnce();
      await expect(readFile(destination)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});

describe('reading Parts from a source that predates Part Categories', () => {
  it('reads the legacy category name and derives the Part Category id from it', async () => {
    const partsConfig = snapshotTables.find((config) => config.tableName === 'parts');
    if (!partsConfig) throw new Error('Missing parts snapshot config');

    const select = vi.fn((projection: Record<string, unknown>) => ({
      from: () =>
        'categoryId' in projection
          ? Promise.reject(Object.assign(new Error('column does not exist'), { code: '42703' }))
          : Promise.resolve([{ category: ' axle ', code: 'AX-1', unitOfMeasure: 'piece' }]),
    }));

    const [part] = await readExistingSnapshotTable({ select } as unknown as Db, partsConfig);

    expect(select.mock.calls[1]?.[0]).toHaveProperty('category');
    expect(part).toMatchObject({ category: ' axle ', categoryId: legacyPartCategoryId('Axle') });
  });
});
