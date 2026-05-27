import { describe, expect, it } from 'vitest';

import { parsePartBulkImportCsv } from './part-bulk-import-csv.js';

describe('parsePartBulkImportCsv', () => {
  it('parses CSV with the expected header', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name',
        ' P-100, DR-100, Main bearing, BOLT & NUT, SUP-100, BLACK, PLAIN NUT, M30 PLAIN NUT ',
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
          name: 'M30 Plain Nut',
          supplierCode: 'SUP-100',
          supplierName: 'Bolt & Nut',
        },
      ],
    });
  });

  it('parses CSV without a header by column position', () => {
    const result = parsePartBulkImportCsv('P-100,,Main bearing,Acme Supplies,SUP-100,GALV,Bearings,Bearing', {
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
          name: 'Bearing',
          supplierCode: 'SUP-100',
          supplierName: 'Acme Supplies',
        },
      ],
    });
  });

  it('reports missing required headers', () => {
    const result = parsePartBulkImportCsv('Code,Description\nP-100,Main bearing', { hasHeader: true });

    expect(result.rows).toEqual([]);
    expect(result.errors).toContain('Missing required column: Supplier.');
  });

  it('reports row-numbered validation errors', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name',
        ',,Main bearing,Acme Supplies,SUP-100,Zinc,Bearings,Bearing',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toContain('Row 2: Code - Part code is required');
  });

  it('reports invalid column counts without a header', () => {
    const result = parsePartBulkImportCsv('P-100,Main bearing', { hasHeader: false });

    expect(result.rows).toEqual([]);
    expect(result.errors).toContain('Row 1: Expected 8 columns, found 2.');
  });

  it('preserves technical tokens when formatting imported display values', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name',
        'P-100,NC,Description,BOLT & NUT,SUP-100,BLACK,SS LOCK NUT,M10 X 120 HT SHCS BOLT',
        'P-101,NC,Description,BOLT & NUT,SUP-101,GALV,HT UNC BOLT,1/2 X 2 HT UNC BOLT',
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
          name: 'M10 X 120 HT SHCS Bolt',
          supplierCode: 'SUP-100',
          supplierName: 'Bolt & Nut',
        },
        {
          category: 'HT UNC Bolt',
          code: 'P-101',
          description: 'Description',
          drawingCode: 'NC',
          finish: 'Galv',
          name: '1/2 X 2 HT UNC Bolt',
          supplierCode: 'SUP-101',
          supplierName: 'Bolt & Nut',
        },
      ],
    });
  });

  it('does not split joined words while formatting imported display values', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name',
        'P-100,NC,Description,BOLT & NUT,SUP-100,STAINLESS,FLATWASHER,M10 SPRINGWASHER',
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
