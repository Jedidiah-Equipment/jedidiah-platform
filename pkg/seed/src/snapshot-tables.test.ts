import { describe, expect, it } from 'vitest';

import {
  applySeedRowDefaults,
  collectStorageFiles,
  projectWritableRow,
  type SnapshotTableConfig,
  snapshotCleanupTables,
  snapshotTableNames,
  snapshotTables,
} from './snapshot-tables.js';

function configFor(tableName: string): SnapshotTableConfig {
  const config = snapshotTables.find((table) => table.tableName === tableName);

  if (!config) {
    throw new Error(`Missing snapshot table config for ${tableName}`);
  }

  return config;
}

describe('snapshot table registry', () => {
  it('lists snapshot tables in dependency order', () => {
    expect(snapshotTableNames).toEqual([
      'user',
      'user_department',
      'job_bay',
      'job_bay_operator_assignment',
      'working_calendar_off_day',
      'job_bay_calendar_exception',
      'account',
      'customers',
      'supplier',
      'parts',
      'product_ranges',
      'product_range_variants',
      'products',
      'product_bay',
      'product_serial_sequence',
      'product_assemblies',
      'assembly_parts',
      'assembly_overrides',
      'quote',
      'quote_selected_assemblies',
      'job',
      'job_cfo_assembly',
      'job_cfo_part',
      'job_slot',
    ]);
  });

  it('cleans snapshot tables in reverse dependency order', () => {
    expect(snapshotCleanupTables.map((table) => table.tableName)).toEqual([...snapshotTableNames].reverse());
  });

  it('uses deterministic filenames', () => {
    expect(snapshotTables.map((table) => table.fileName)).toEqual([
      'user.json',
      'user_department.json',
      'job_bay.json',
      'job_bay_operator_assignment.json',
      'working_calendar_off_day.json',
      'job_bay_calendar_exception.json',
      'account.json',
      'customers.json',
      'supplier.json',
      'parts.json',
      'product_ranges.json',
      'product_range_variants.json',
      'products.json',
      'product_bay.json',
      'product_serial_sequence.json',
      'product_assemblies.json',
      'assembly_parts.json',
      'assembly_overrides.json',
      'quote.json',
      'quote_selected_assemblies.json',
      'job.json',
      'job_cfo_assembly.json',
      'job_cfo_part.json',
      'job_slot.json',
    ]);
  });

  it('backfills hourly rates when loading snapshots captured before the field existed', () => {
    expect(configFor('quote').seedRowDefaults?.({ kind: 'custom' }, 0)).toEqual({ hourlyRate: 850 });
    expect(configFor('quote').seedRowDefaults?.({ kind: 'product' }, 0)).toEqual({ hourlyRate: null });
    expect(configFor('quote').optionalReadColumns).toEqual(['hourlyRate']);
  });

  it('keeps captured rollout values ahead of seed fallbacks', () => {
    const quoteConfig = configFor('quote');

    expect(applySeedRowDefaults(quoteConfig, { kind: 'custom' }, 0)).toMatchObject({ hourlyRate: 850 });
    expect(applySeedRowDefaults(quoteConfig, { hourlyRate: 975, kind: 'custom' }, 0)).toMatchObject({
      hourlyRate: 975,
    });
  });

  it('projects generated assembly override columns out before import', () => {
    const assemblyOverridesConfig = snapshotTables.find((table) => table.tableName === 'assembly_overrides');

    if (!assemblyOverridesConfig) {
      throw new Error('Missing assembly_overrides snapshot table config');
    }

    expect(
      projectWritableRow(assemblyOverridesConfig, {
        optionalAssemblyId: 'optional-id',
        optionalKind: 'optional',
        productId: 'product-id',
        standardAssemblyId: 'standard-id',
        standardKind: 'standard',
      }),
    ).toEqual({
      optionalAssemblyId: 'optional-id',
      productId: 'product-id',
      standardAssemblyId: 'standard-id',
    });
  });

  it('revives nullable supplier soft-delete timestamps', () => {
    expect(configFor('supplier').timestampColumns).toContain('deletedAt');
  });

  it('revives nullable Job cancellation timestamps', () => {
    expect(configFor('job').timestampColumns).toContain('cancelledAt');
  });

  it('revives nullable catalog soft-delete timestamps', () => {
    expect(configFor('product_ranges').timestampColumns).toContain('deletedAt');
    expect(configFor('product_range_variants').timestampColumns).toContain('deletedAt');
    expect(configFor('products').timestampColumns).toContain('deletedAt');
  });

  it('preserves catalog soft-delete and variant columns from staging snapshots', () => {
    expect(configFor('product_ranges').omitReadColumns ?? []).not.toContain('deletedAt');
    expect(configFor('product_range_variants').omitReadColumns ?? []).not.toContain('deletedAt');
    expect(configFor('products').omitReadColumns ?? []).not.toContain('deletedAt');
    expect(configFor('products').omitReadColumns ?? []).not.toContain('variantId');
  });

  it('extracts product image storage files, ignoring the inline thumbnail data URL', () => {
    const rows = [
      {
        images: {
          primary: { storageKey: 'product-images/product/p1/primary/a.png', contentType: 'image/png', byteSize: 1 },
          secondary: {
            storageKey: 'product-images/product/p1/secondary/b.jpg',
            contentType: 'image/jpeg',
            byteSize: 2,
          },
        },
        thumbnailDataUrl: 'data:image/png;base64,zzz',
      },
      { images: {} },
    ];

    expect(collectStorageFiles(configFor('products'), rows)).toEqual([
      { storageKey: 'product-images/product/p1/primary/a.png', contentType: 'image/png' },
      { storageKey: 'product-images/product/p1/secondary/b.jpg', contentType: 'image/jpeg' },
    ]);
  });

  it('extracts product range image and logo storage files, skipping null columns', () => {
    const rows = [
      {
        image: { storageKey: 'range-images/product-range/r1/a.png', contentType: 'image/png', byteSize: 1 },
        logo: { storageKey: 'range-logos/product-range/r1/b.png', contentType: 'image/png', byteSize: 2 },
      },
      { image: null, logo: null },
    ];

    expect(collectStorageFiles(configFor('product_ranges'), rows)).toEqual([
      { storageKey: 'range-images/product-range/r1/a.png', contentType: 'image/png' },
      { storageKey: 'range-logos/product-range/r1/b.png', contentType: 'image/png' },
    ]);
  });

  it('returns no storage files for a table without a storageFiles extractor', () => {
    expect(collectStorageFiles(configFor('customers'), [{ thumbnailDataUrl: 'data:image/png;base64,zzz' }])).toEqual(
      [],
    );
  });
});
