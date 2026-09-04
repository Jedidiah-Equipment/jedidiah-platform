import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  collectStorageFiles,
  prepareSnapshotRow,
  projectWritableRow,
  type SnapshotTableConfig,
  snapshotCleanupTables,
  snapshotTables,
} from './snapshot-tables.js';

const snapshotTableNames = snapshotTables.map((table) => table.tableName);

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
      'product_material_line',
      'product_bay',
      'product_serial_sequence',
      'product_unit',
      'product_assemblies',
      'assembly_parts',
      'assembly_overrides',
      'quote',
      'quote_work_items',
      'quote_work_item_parts',
      'quote_selected_assemblies',
      'job',
      'job_stock_close_out',
      'product_unit_ownership_transfer',
      'job_build_spec_assembly',
      'job_cfo_assembly',
      'job_cfo_part',
      'job_slot',
      'feedback',
      'feedback_department',
      'feedback_user',
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
      'product_material_line.json',
      'product_bay.json',
      'product_serial_sequence.json',
      'product_unit.json',
      'product_assemblies.json',
      'assembly_parts.json',
      'assembly_overrides.json',
      'quote.json',
      'quote_work_items.json',
      'quote_work_item_parts.json',
      'quote_selected_assemblies.json',
      'job.json',
      'job_stock_close_out.json',
      'product_unit_ownership_transfer.json',
      'job_build_spec_assembly.json',
      'job_cfo_assembly.json',
      'job_cfo_part.json',
      'job_slot.json',
      'feedback.json',
      'feedback_department.json',
      'feedback_user.json',
    ]);
  });

  it('revives every schema timestamp that uses Date mode', () => {
    for (const config of snapshotTables) {
      const schemaTimestampColumns = Object.entries(getTableColumns(config.table))
        .filter(([, column]) => column.columnType === 'PgTimestamp')
        .map(([columnName]) => columnName);

      expect(config.timestampColumns, config.tableName).toEqual(expect.arrayContaining(schemaTimestampColumns));
    }
  });

  it('backfills rollout quote fields when loading snapshots captured before they existed', () => {
    expect(configFor('quote').seedRowDefaults?.({ kind: 'custom', status: 'draft' }, 0)).toEqual({
      cancellationReason: null,
    });
    expect(configFor('quote').seedRowDefaults?.({ kind: 'product', status: 'cancelled' }, 0)).toEqual({
      cancellationReason: 'Reason not recorded (cancelled before cancellation reasons were required).',
    });
    expect(configFor('quote').optionalReadColumns).toEqual(['cancellationReason']);
  });

  it('keeps captured rollout values ahead of seed fallbacks', () => {
    const quoteConfig = configFor('quote');

    expect(prepareSnapshotRow(quoteConfig, { kind: 'custom', status: 'cancelled' }, 0)).toMatchObject({
      cancellationReason: 'Reason not recorded (cancelled before cancellation reasons were required).',
    });
    expect(
      prepareSnapshotRow(quoteConfig, { cancellationReason: 'Captured', kind: 'custom', status: 'cancelled' }, 0),
    ).toMatchObject({ cancellationReason: 'Captured' });
  });

  it('preserves Contracting roles once the rollout column exists', () => {
    const userConfig = configFor('user');

    expect(userConfig.optionalReadColumns).toContain('contractingRole');
    expect(userConfig.omitReadColumns ?? []).not.toContain('contractingRole');
    expect(prepareSnapshotRow(userConfig, { contractingRole: 'foreman', role: null }, 0)).toMatchObject({
      contractingRole: 'foreman',
    });
    expect(prepareSnapshotRow(userConfig, { role: 'sales' }, 0)).toMatchObject({ contractingRole: null });
  });

  it('backfills assembly visibility while the rollout column is absent from the source snapshot', () => {
    const assemblyConfig = configFor('product_assemblies');

    expect(assemblyConfig.optionalReadColumns).toEqual(['isPubliclyVisible']);
    expect(prepareSnapshotRow(assemblyConfig, { name: 'Base frame' }, 0)).toMatchObject({
      isPubliclyVisible: true,
    });
    expect(
      prepareSnapshotRow(assemblyConfig, { isPubliclyVisible: false, name: 'Internal grouping' }, 0),
    ).toMatchObject({
      isPubliclyVisible: false,
    });
  });

  it('normalizes legacy part inventory values while preparing snapshots', () => {
    const partsConfig = configFor('parts');

    expect(prepareSnapshotRow(partsConfig, { code: 'P-100', unitOfMeasure: 'quantity' }, 0)).toMatchObject({
      standardPurchaseLengthMm: null,
      stockTrackingMode: 'perpetual',
      unitOfMeasure: 'piece',
    });
    expect(
      prepareSnapshotRow(partsConfig, { category: '6000', code: 'SEMP-0001', unitOfMeasure: 'mm' }, 0),
    ).toMatchObject({
      category: 'Pipe',
      standardPurchaseLengthMm: 6000,
      unitOfMeasure: 'mm',
    });
    expect(prepareSnapshotRow(partsConfig, { code: 'LTE-0027', unitOfMeasure: 'mm' }, 0)).toMatchObject({
      standardPurchaseLengthMm: 1000,
      unitOfMeasure: 'mm',
    });
    expect(
      prepareSnapshotRow(
        partsConfig,
        {
          category: 'Tube',
          code: 'SEMP-0001',
          standardPurchaseLengthMm: 12000,
          unitOfMeasure: 'mm',
        },
        0,
      ),
    ).toMatchObject({ category: 'Tube', standardPurchaseLengthMm: 12000 });
  });

  it('keeps rollout Work Item tables optional until the source migration deploys', () => {
    expect(configFor('quote_work_items').optionalReadTable).toBe(true);
    expect(configFor('quote_work_item_parts').optionalReadTable).toBe(true);
  });

  it('keeps the rollout Build Spec table optional until the source migration deploys', () => {
    expect(configFor('job_build_spec_assembly').optionalReadTable).toBe(true);
  });

  it('keeps Job stock close-outs rollout-safe and timestamp-aware', () => {
    expect(configFor('job_stock_close_out').optionalReadTable).toBe(true);
    expect(configFor('job_stock_close_out').timestampColumns).toEqual(['createdAt']);
  });

  it('keeps the rollout Feedback tables optional until the source migration deploys', () => {
    expect(configFor('feedback').optionalReadTable).toBe(true);
    expect(configFor('feedback_department').optionalReadTable).toBe(true);
    expect(configFor('feedback_user').optionalReadTable).toBe(true);
    expect(configFor('feedback').timestampColumns).toEqual(['createdAt', 'updatedAt']);
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
