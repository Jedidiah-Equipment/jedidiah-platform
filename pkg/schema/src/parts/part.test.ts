import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Part, PartBulkImportInput, PartBulkImportResult, PartCreateInput, PartListInput } from './part.js';

describe('PartCreateInput', () => {
  it('normalizes part fields', () => {
    expect(
      PartCreateInput.parse({
        category: '  Bearings  ',
        code: '  P-100  ',
        description: '  Main bearing  ',
        drawingCode: '  ',
        finish: '  Zinc  ',
        name: '  Bearing  ',
        supplierCode: '  SUP-100  ',
        supplierId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toEqual({
      category: 'Bearings',
      code: 'P-100',
      description: 'Main bearing',
      drawingCode: null,
      finish: 'Zinc',
      name: 'Bearing',
      supplierCode: 'SUP-100',
      supplierId: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('requires required part fields', () => {
    expect(() =>
      PartCreateInput.parse({
        category: ' ',
        code: ' ',
        description: ' ',
        finish: ' ',
        name: ' ',
        supplierCode: ' ',
        supplierId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toThrow();
  });
});

describe('PartListInput', () => {
  it('defaults list controls', () => {
    expect(PartListInput.parse({})).toMatchObject({
      columnFilters: {},
      page: 1,
      search: '',
      sortBy: 'name',
      sortDirection: 'asc',
    });
  });
});

describe('PartBulkImportInput', () => {
  it('normalizes bulk import rows', () => {
    expect(
      PartBulkImportInput.parse({
        rows: [
          {
            category: '  Bearings  ',
            code: '  P-100  ',
            description: '  Main bearing  ',
            drawingCode: '  ',
            finish: '  Zinc  ',
            name: '  Bearing  ',
            supplierCode: '  SUP-100  ',
            supplierName: '  Acme Supplies  ',
          },
        ],
      }),
    ).toEqual({
      rows: [
        {
          category: 'Bearings',
          code: 'P-100',
          description: 'Main bearing',
          drawingCode: null,
          finish: 'Zinc',
          name: 'Bearing',
          supplierCode: 'SUP-100',
          supplierName: 'Acme Supplies',
        },
      ],
    });
  });

  it('requires rows and required row fields', () => {
    expect(() => PartBulkImportInput.parse({ rows: [] })).toThrow();
    expect(() =>
      PartBulkImportInput.parse({
        rows: [
          {
            category: ' ',
            code: ' ',
            description: ' ',
            finish: ' ',
            name: ' ',
            supplierCode: ' ',
            supplierName: ' ',
          },
        ],
      }),
    ).toThrow();
  });
});

describe('PartBulkImportResult', () => {
  it('accepts non-negative import counts', () => {
    expect(PartBulkImportResult.parse({ importedCount: 1, updatedCount: 2 })).toEqual({
      importedCount: 1,
      updatedCount: 2,
    });
  });
});

describe('Part', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(Part)).not.toThrow();
  });
});
