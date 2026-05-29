import { describe, expect, it } from 'vitest';

import { parsePartBulkImportCsv } from './part-bulk-import-csv.js';

describe('parsePartBulkImportCsv', () => {
  it('parses CSV with the expected header', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit',
        ' P-100, DR-100, Main bearing, BOLT & NUT, SUP-100, BLACK, PLAIN NUT, M30 PLAIN NUT, mm ',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result).toEqual({
      errors: [],
      rows: [
        {
          category: 'Plain Nut',
          code: 'P-100',
          description: 'Main bearing',
          drawingCode: 'DR-100',
          finish: 'Black',
          lineNumber: 2,
          name: 'M30 Plain Nut',
          supplierCode: 'SUP-100',
          supplierName: 'Bolt & Nut',
          unitOfMeasure: 'mm',
        },
      ],
    });
  });

  it('parses CSV without a header by column position', () => {
    const result = parsePartBulkImportCsv('P-100,,Main bearing,Acme Supplies,SUP-100,GALV,Bearings,Bearing,quantity', {
      hasHeader: false,
    });

    expect(result).toEqual({
      errors: [],
      rows: [
        {
          category: 'Bearings',
          code: 'P-100',
          description: 'Main bearing',
          drawingCode: null,
          finish: 'Galv',
          lineNumber: 1,
          name: 'Bearing',
          supplierCode: 'SUP-100',
          supplierName: 'Acme Supplies',
          unitOfMeasure: 'quantity',
        },
      ],
    });
  });

  it('maps unit labels to enum values', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit',
        'P-100,,Main bearing,Acme Supplies,SUP-100,Zinc,Bearings,Bearing,Millimetres',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.unitOfMeasure).toBe('mm');
  });

  it('reports missing required headers', () => {
    const result = parsePartBulkImportCsv('Code,Description\nP-100,Main bearing', { hasHeader: true });

    expect(result.rows).toEqual([]);
    expect(result.errors).toContain('Missing required column: Supplier.');
  });

  it('blocks rows when the CSV parser reports file-level errors', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit',
        'P-100,,"Main bearing,Acme Supplies,SUP-100,Zinc,Bearings,Bearing,quantity',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toContain('CSV parse error: Quoted field unterminated');
  });

  it('keeps valid rows while reporting row-numbered validation errors', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit',
        ',,Main bearing,Acme Supplies,SUP-100,Zinc,Bearings,Bearing,quantity',
        'P-101,,Second bearing,Acme Supplies,SUP-101,Zinc,Bearings,Bearing,quantity',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result.rows).toEqual([
      {
        category: 'Bearings',
        code: 'P-101',
        description: 'Second bearing',
        drawingCode: null,
        finish: 'Zinc',
        lineNumber: 3,
        name: 'Bearing',
        supplierCode: 'SUP-101',
        supplierName: 'Acme Supplies',
        unitOfMeasure: 'quantity',
      },
    ]);
    expect(result.errors).toContain('Row 2: Code - Part code is required');
  });

  it('reports row-numbered errors for missing and unknown units', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit',
        'P-100,,Main bearing,Acme Supplies,SUP-100,Zinc,Bearings,Bearing,',
        'P-101,,Second bearing,Acme Supplies,SUP-101,Zinc,Bearings,Bearing,metres',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      'Row 2: Unit - Unit must be one of quantity, mm.',
      'Row 3: Unit - Unit must be one of quantity, mm.',
    ]);
  });

  it('reports invalid column counts without a header', () => {
    const result = parsePartBulkImportCsv('P-100,Main bearing', { hasHeader: false });

    expect(result.rows).toEqual([]);
    expect(result.errors).toContain('Row 1: Expected 9 columns, found 2.');
  });

  it('preserves technical tokens when formatting imported display values', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit',
        'P-100,NC,Description,BOLT & NUT,SUP-100,BLACK,SS LOCK NUT,M10 X 120 HT SHCS BOLT,quantity',
        'P-101,NC,Description,BOLT & NUT,SUP-101,GALV,HT UNC BOLT,1/2 X 2 HT UNC BOLT,mm',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result).toEqual({
      errors: [],
      rows: [
        {
          category: 'SS Lock Nut',
          code: 'P-100',
          description: 'Description',
          drawingCode: 'NC',
          finish: 'Black',
          lineNumber: 2,
          name: 'M10 X 120 HT SHCS Bolt',
          supplierCode: 'SUP-100',
          supplierName: 'Bolt & Nut',
          unitOfMeasure: 'quantity',
        },
        {
          category: 'HT UNC Bolt',
          code: 'P-101',
          description: 'Description',
          drawingCode: 'NC',
          finish: 'Galv',
          lineNumber: 3,
          name: '1/2 X 2 HT UNC Bolt',
          supplierCode: 'SUP-101',
          supplierName: 'Bolt & Nut',
          unitOfMeasure: 'mm',
        },
      ],
    });
  });

  it('does not split joined words while formatting imported display values', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit',
        'P-100,NC,Description,BOLT & NUT,SUP-100,STAINLESS,FLATWASHER,M10 SPRINGWASHER,quantity',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result.rows[0]).toMatchObject({
      category: 'Flatwasher',
      finish: 'Stainless',
      name: 'M10 Springwasher',
    });
  });
});
