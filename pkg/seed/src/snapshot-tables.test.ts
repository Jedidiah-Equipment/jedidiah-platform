import { describe, expect, it } from 'vitest';

import { projectWritableRow, snapshotCleanupTables, snapshotTableNames, snapshotTables } from './snapshot-tables.js';

describe('snapshot table registry', () => {
  it('lists snapshot tables in dependency order', () => {
    expect(snapshotTableNames).toEqual([
      'user',
      'user_department',
      'job_bay',
      'job_bay_operator_assignment',
      'working_calendar_off_day',
      'account',
      'customers',
      'supplier',
      'parts',
      'product_ranges',
      'products',
      'product_bay',
      'product_serial_sequence',
      'product_assemblies',
      'assembly_parts',
      'assembly_overrides',
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
      'account.json',
      'customers.json',
      'supplier.json',
      'parts.json',
      'product_ranges.json',
      'products.json',
      'product_bay.json',
      'product_serial_sequence.json',
      'product_assemblies.json',
      'assembly_parts.json',
      'assembly_overrides.json',
    ]);
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
});
