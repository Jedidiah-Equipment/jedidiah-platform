import { describe, expect, it } from 'vitest';

import {
  assertProductionImportIsAllowed,
  assertSnapshotObjectFilesExist,
  collectPromotedStorageFiles,
  filterProductionSnapshots,
  type SnapshotWithRows,
  withProductionCredentialPasswords,
} from './seed-promoter.js';
import type { SnapshotRow, SnapshotTableDefinition } from './snapshot-table-definitions.js';
import { snapshotTableDefinitions } from './snapshot-table-definitions.js';

function configFor(tableName: string): SnapshotTableDefinition {
  const config = snapshotTableDefinitions.find((table) => table.tableName === tableName);

  if (!config) {
    throw new Error(`Missing snapshot table config for ${tableName}`);
  }

  return config;
}

function snapshots(rowsByTable: Record<string, SnapshotRow[]>): SnapshotWithRows[] {
  return snapshotTableDefinitions.map((config) => ({
    config,
    rows: rowsByTable[config.tableName] ?? [],
  }));
}

function rowsFor(snapshots: readonly SnapshotWithRows[], tableName: string): SnapshotRow[] {
  return snapshots.find((snapshot) => snapshot.config.tableName === tableName)?.rows ?? [];
}

function ids(rows: readonly SnapshotRow[]): unknown[] {
  return rows.map((row) => row.id);
}

describe('production seed promotion filters', () => {
  it('excludes Sue Smith and dependent auth rows', () => {
    const promoted = filterProductionSnapshots(
      snapshots({
        user: [
          { id: 'seed-sue-user', email: 'sales@jedidiahequipment.co.za' },
          { id: 'staff-user', email: 'staff@example.test' },
        ],
        account: [
          { id: 'sue-account', userId: 'seed-sue-user' },
          { id: 'staff-account', userId: 'staff-user' },
        ],
        user_department: [
          { userId: 'seed-sue-user', department: 'sales' },
          { userId: 'staff-user', department: 'procurement' },
        ],
        job_bay_operator_assignment: [
          { id: 'sue-assignment', operatorUserId: 'seed-sue-user' },
          { id: 'staff-assignment', operatorUserId: 'staff-user' },
        ],
      }),
    );

    expect(ids(rowsFor(promoted, 'user'))).toEqual(['staff-user']);
    expect(ids(rowsFor(promoted, 'account'))).toEqual(['staff-account']);
    expect(rowsFor(promoted, 'user_department')).toEqual([{ userId: 'staff-user', department: 'procurement' }]);
    expect(ids(rowsFor(promoted, 'job_bay_operator_assignment'))).toEqual(['staff-assignment']);
  });

  it('omits quote and job clusters while preserving sequence-reset table configs', () => {
    const promoted = filterProductionSnapshots(
      snapshots({
        quote: [{ id: 'quote-1', code: 42 }],
        quote_line_items: [{ id: 'line-1', quoteId: 'quote-1' }],
        quote_selected_assemblies: [{ id: 'selected-1', quoteId: 'quote-1' }],
        job: [{ id: 'job-1', code: 9 }],
        job_cfo_assembly: [{ id: 'job-assembly-1', jobId: 'job-1' }],
        job_cfo_part: [{ id: 'job-part-1', jobId: 'job-1' }],
        job_slot: [{ id: 'slot-1', jobId: 'job-1' }],
      }),
    );

    for (const tableName of [
      'quote',
      'quote_line_items',
      'quote_selected_assemblies',
      'job',
      'job_cfo_assembly',
      'job_cfo_part',
      'job_slot',
    ]) {
      expect(rowsFor(promoted, tableName)).toEqual([]);
    }

    expect(rowsFor(promoted, 'quote')).toEqual([]);
    expect(configFor('quote').resetSequence).toEqual({ sequenceName: 'quote_code_seq', columnName: 'code' });
    expect(configFor('job').resetSequence).toEqual({ sequenceName: 'job_code_seq', columnName: 'code' });
  });

  it('drops soft-deleted catalog rows and children whose parents are not retained', () => {
    const promoted = filterProductionSnapshots(
      snapshots({
        supplier: [
          { id: 'active-supplier', deletedAt: null },
          { id: 'deleted-supplier', deletedAt: new Date('2026-07-01T00:00:00.000Z') },
        ],
        parts: [
          { id: 'kept-part', supplierId: 'active-supplier' },
          { id: 'deleted-supplier-part', supplierId: 'deleted-supplier' },
        ],
        product_ranges: [
          { id: 'active-range', deletedAt: null },
          { id: 'deleted-range', deletedAt: new Date('2026-07-01T00:00:00.000Z') },
        ],
        product_range_variants: [
          { id: 'kept-variant', rangeId: 'active-range', deletedAt: null },
          { id: 'deleted-variant', rangeId: 'active-range', deletedAt: new Date('2026-07-01T00:00:00.000Z') },
          { id: 'deleted-range-variant', rangeId: 'deleted-range', deletedAt: null },
        ],
        products: [
          { id: 'kept-product', rangeId: 'active-range', variantId: 'kept-variant', deletedAt: null },
          { id: 'kept-product-no-variant', rangeId: 'active-range', variantId: null, deletedAt: null },
          {
            id: 'deleted-product',
            rangeId: 'active-range',
            variantId: null,
            deletedAt: new Date('2026-07-01T00:00:00.000Z'),
          },
          { id: 'deleted-range-product', rangeId: 'deleted-range', variantId: null, deletedAt: null },
          { id: 'deleted-variant-product', rangeId: 'active-range', variantId: 'deleted-variant', deletedAt: null },
        ],
        product_bay: [
          { productId: 'kept-product', bayId: 'bay-1' },
          { productId: 'deleted-product', bayId: 'bay-1' },
        ],
        product_serial_sequence: [
          { productId: 'kept-product', lastSequence: 7 },
          { productId: 'deleted-product', lastSequence: 2 },
        ],
        product_assemblies: [
          { id: 'kept-assembly', productId: 'kept-product' },
          { id: 'deleted-product-assembly', productId: 'deleted-product' },
        ],
        assembly_parts: [
          { assemblyId: 'kept-assembly', partId: 'kept-part' },
          { assemblyId: 'kept-assembly', partId: 'deleted-supplier-part' },
          { assemblyId: 'deleted-product-assembly', partId: 'kept-part' },
        ],
        assembly_overrides: [
          {
            optionalAssemblyId: 'kept-assembly',
            optionalKind: 'optional',
            productId: 'kept-product',
            standardAssemblyId: 'kept-assembly',
            standardKind: 'standard',
          },
          {
            optionalAssemblyId: 'deleted-product-assembly',
            productId: 'kept-product',
            standardAssemblyId: 'kept-assembly',
          },
        ],
      }),
    );

    expect(ids(rowsFor(promoted, 'supplier'))).toEqual(['active-supplier']);
    expect(ids(rowsFor(promoted, 'parts'))).toEqual(['kept-part']);
    expect(ids(rowsFor(promoted, 'product_ranges'))).toEqual(['active-range']);
    expect(ids(rowsFor(promoted, 'product_range_variants'))).toEqual(['kept-variant']);
    expect(ids(rowsFor(promoted, 'products'))).toEqual(['kept-product', 'kept-product-no-variant']);
    expect(rowsFor(promoted, 'product_bay')).toEqual([{ productId: 'kept-product', bayId: 'bay-1' }]);
    expect(rowsFor(promoted, 'product_serial_sequence')).toEqual([{ productId: 'kept-product', lastSequence: 7 }]);
    expect(ids(rowsFor(promoted, 'product_assemblies'))).toEqual(['kept-assembly']);
    expect(rowsFor(promoted, 'assembly_parts')).toEqual([{ assemblyId: 'kept-assembly', partId: 'kept-part' }]);
    expect(rowsFor(promoted, 'assembly_overrides')).toEqual([
      {
        optionalAssemblyId: 'kept-assembly',
        productId: 'kept-product',
        standardAssemblyId: 'kept-assembly',
      },
    ]);
  });

  it('collects storage files only from retained rows', () => {
    const promoted = filterProductionSnapshots(
      snapshots({
        product_ranges: [
          {
            id: 'active-range',
            deletedAt: null,
            image: { storageKey: 'ranges/active-image.webp', contentType: 'image/webp' },
            logo: { storageKey: 'ranges/active-logo.webp', contentType: 'image/webp' },
          },
          {
            id: 'deleted-range',
            deletedAt: new Date('2026-07-01T00:00:00.000Z'),
            image: { storageKey: 'ranges/deleted-image.webp', contentType: 'image/webp' },
          },
        ],
        products: [
          {
            id: 'active-product',
            rangeId: 'active-range',
            variantId: null,
            deletedAt: null,
            images: {
              primary: { storageKey: 'products/active.webp', contentType: 'image/webp' },
            },
          },
          {
            id: 'deleted-product',
            rangeId: 'active-range',
            variantId: null,
            deletedAt: new Date('2026-07-01T00:00:00.000Z'),
            images: {
              primary: { storageKey: 'products/deleted.webp', contentType: 'image/webp' },
            },
          },
        ],
      }),
    );

    expect(collectPromotedStorageFiles(promoted)).toEqual([
      { storageKey: 'ranges/active-image.webp', contentType: 'image/webp' },
      { storageKey: 'ranges/active-logo.webp', contentType: 'image/webp' },
      { storageKey: 'products/active.webp', contentType: 'image/webp' },
    ]);
  });
});

describe('production seed promotion credentials', () => {
  it('uses a random password hash per credential account', async () => {
    const promoted = await withProductionCredentialPasswords(
      snapshots({
        account: [
          { id: 'account-1', providerId: 'credential', password: null },
          { id: 'account-2', providerId: 'credential', password: null },
          { id: 'oauth-account', providerId: 'oauth', password: null },
        ],
      }),
    );
    const accounts = rowsFor(promoted, 'account');
    expect(accounts).toHaveLength(3);
    const [first, second, oauth] = accounts;

    expect(first?.password).toEqual(expect.any(String));
    expect(second?.password).toEqual(expect.any(String));
    expect(first?.password).not.toBe(second?.password);
    expect(oauth?.password).toBeNull();
  });
});

describe('production seed promotion guards', () => {
  const safeEnv = {
    APP_ENV: 'production',
    CONFIRM_PRODUCTION_IMPORT: 'production',
    DATABASE_URL: 'postgres://db.example.test/prod',
    DOCUMENT_STORAGE_ACCESS_KEY_ID: 'prod-access-key',
    DOCUMENT_STORAGE_BUCKET: 'prod-documents',
    DOCUMENT_STORAGE_ENDPOINT: 'https://objects.example.test',
    DOCUMENT_STORAGE_FORCE_PATH_STYLE: 'false',
    DOCUMENT_STORAGE_REGION: 'af-south-1',
    DOCUMENT_STORAGE_SECRET_ACCESS_KEY: 'prod-secret-key',
  } satisfies NodeJS.ProcessEnv;

  it('requires production app env and explicit confirmation', () => {
    expect(() =>
      assertProductionImportIsAllowed({ ...safeEnv, APP_ENV: 'staging' }, 'postgres://db.example.test/prod'),
    ).toThrow('APP_ENV=production');
    expect(() =>
      assertProductionImportIsAllowed(
        { ...safeEnv, CONFIRM_PRODUCTION_IMPORT: undefined },
        'postgres://db.example.test/prod',
      ),
    ).toThrow('CONFIRM_PRODUCTION_IMPORT=production');
  });

  it('requires explicit production database and document storage env', () => {
    expect(() => assertProductionImportIsAllowed({ ...safeEnv, DATABASE_URL: undefined })).toThrow('DATABASE_URL');
    expect(() =>
      assertProductionImportIsAllowed({
        ...safeEnv,
        DOCUMENT_STORAGE_BUCKET: undefined,
        DOCUMENT_STORAGE_REGION: undefined,
      }),
    ).toThrow('DOCUMENT_STORAGE_BUCKET, DOCUMENT_STORAGE_REGION');
  });

  it('refuses staging, local, and template database targets', () => {
    expect(() =>
      assertProductionImportIsAllowed(
        { ...safeEnv, STAGING_DATABASE_URL: 'postgres://db.example.test/staging' },
        'postgres://db.example.test/staging',
      ),
    ).toThrow('matches STAGING_DATABASE_URL');
    expect(() => assertProductionImportIsAllowed(safeEnv, 'postgres://localhost/prod')).toThrow('local database host');
    expect(() => assertProductionImportIsAllowed(safeEnv, 'postgres://db.example.test/jedidiah_template')).toThrow(
      'template database',
    );
  });

  it('refuses local document storage targets', () => {
    expect(() =>
      assertProductionImportIsAllowed({ ...safeEnv, DOCUMENT_STORAGE_ENDPOINT: 'http://localhost:9000' }),
    ).toThrow('local document storage endpoint');
  });

  it('fails when a retained object is missing from the local snapshot object cache', async () => {
    await expect(
      assertSnapshotObjectFilesExist(
        snapshots({
          product_ranges: [
            {
              id: 'active-range',
              deletedAt: null,
              image: { storageKey: 'missing-test-object/never-created.webp', contentType: 'image/webp' },
            },
          ],
        }),
      ),
    ).rejects.toThrow('Missing local object file missing-test-object/never-created.webp');
  });
});
