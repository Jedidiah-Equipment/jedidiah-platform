import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  PART_UNIT_OF_MEASURE_LABELS,
  Part,
  PartBulkImportInput,
  PartBulkImportResult,
  PartCreateInput,
  PartListInput,
  PartUnitOfMeasure,
} from './part.js';

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
        unitOfMeasure: 'mm',
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
      unitOfMeasure: 'mm',
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
        unitOfMeasure: 'quantity',
      }),
    ).toThrow();
  });
});

describe('PartUnitOfMeasure', () => {
  it('accepts quantity and millimetres with shared labels', () => {
    expect(PartUnitOfMeasure.options).toEqual(['quantity', 'mm']);
    expect(PART_UNIT_OF_MEASURE_LABELS).toEqual({
      mm: 'Millimetres',
      quantity: 'Quantity',
    });
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

  it('accepts supplier filters', () => {
    expect(PartListInput.parse({ supplierId: '00000000-0000-4000-8000-000000000001' })).toMatchObject({
      supplierId: '00000000-0000-4000-8000-000000000001',
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
            lineNumber: 4,
            name: '  Bearing  ',
            supplierCode: '  SUP-100  ',
            supplierName: '  Acme Supplies  ',
            unitOfMeasure: 'mm',
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
          lineNumber: 4,
          name: 'Bearing',
          supplierCode: 'SUP-100',
          supplierName: 'Acme Supplies',
          unitOfMeasure: 'mm',
        },
      ],
    });
  });

  it('accepts supplier scoped imports', () => {
    expect(
      PartBulkImportInput.parse({
        rows: [
          {
            category: 'Bearings',
            code: 'P-100',
            description: 'Main bearing',
            finish: 'Zinc',
            lineNumber: 4,
            name: 'Bearing',
            supplierCode: 'SUP-100',
            supplierName: 'Acme Supplies',
            unitOfMeasure: 'quantity',
          },
        ],
        supplierId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toMatchObject({
      supplierId: '00000000-0000-4000-8000-000000000001',
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
            lineNumber: 1,
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
    expect(
      PartBulkImportResult.parse({ errors: ['Line 4: Part was skipped.'], importedCount: 1, updatedCount: 2 }),
    ).toEqual({
      errors: ['Line 4: Part was skipped.'],
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
