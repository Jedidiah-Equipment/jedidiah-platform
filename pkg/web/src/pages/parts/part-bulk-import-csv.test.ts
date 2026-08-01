import { describe, expect, it } from 'vitest';

import { parsePartBulkImportCsv } from './part-bulk-import-csv.js';

describe('parsePartBulkImportCsv', () => {
  it('parses CSV with the expected header', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit,Internally Fabricated,Standard Purchase Length (mm)',
        ' P-100, DR-100, Main bearing, BOLT & NUT, SUP-100, BLACK, PLAIN NUT, M30 PLAIN NUT, mm, yes, 6000 ',
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
          isInternallyFabricated: true,
          lineNumber: 2,
          name: 'M30 Plain Nut',
          standardPurchaseLengthMm: 6000,
          supplierCode: 'SUP-100',
          supplierName: 'Bolt & Nut',
          unitOfMeasure: 'mm',
        },
      ],
    });
  });

  it('parses CSV without a header by column position', () => {
    const result = parsePartBulkImportCsv(
      'P-100,,Main bearing,Acme Supplies,SUP-100,GALV,Bearings,Bearing,piece,false',
      {
        hasHeader: false,
      },
    );

    expect(result).toEqual({
      errors: [],
      rows: [
        {
          category: 'Bearings',
          code: 'P-100',
          description: 'Main bearing',
          drawingCode: null,
          finish: 'Galv',
          isInternallyFabricated: false,
          lineNumber: 1,
          name: 'Bearing',
          supplierCode: 'SUP-100',
          supplierName: 'Acme Supplies',
          unitOfMeasure: 'piece',
        },
      ],
    });
  });

  it('isolates malformed headerless rows from later positional rows', () => {
    const result = parsePartBulkImportCsv(
      [
        'P-100,,Main bearing,Acme Supplies,SUP-100,GALV,Bearings,Bearing,piece',
        'P-101,,Second bearing,Acme Supplies,SUP-101,GALV,Bearings,Bearing,piece,false',
      ].join('\n'),
      { hasHeader: false },
    );

    expect(result.errors).toEqual(['Row 1: Expected 10 or 11 columns, found 9.']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ code: 'P-101', isInternallyFabricated: false, lineNumber: 2 });
  });

  it('maps every unit label to its enum value', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit,Internally Fabricated,Standard Purchase Length (mm)',
        'P-100,,Part,Acme Supplies,SUP-100,Zinc,Parts,Part,Pieces,no,',
        'P-101,,Part,Acme Supplies,SUP-101,Zinc,Parts,Part,Sets,no,',
        'P-102,,Part,Acme Supplies,SUP-102,Zinc,Parts,Part,Boxes,no,',
        'P-103,,Part,Acme Supplies,SUP-103,Zinc,Parts,Part,Pairs,no,',
        'P-104,,Part,Acme Supplies,SUP-104,Zinc,Parts,Part,Millimetres,no,6000',
        'P-105,,Part,Acme Supplies,SUP-105,Zinc,Parts,Part,Kilograms,no,',
        'P-106,,Part,Acme Supplies,SUP-106,Zinc,Parts,Part,Litres,no,',
        'P-107,,Part,Acme Supplies,SUP-107,Zinc,Parts,Part,quantity,no,',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result.errors).toEqual([]);
    expect(result.rows.map((row) => row.unitOfMeasure)).toEqual([
      'piece',
      'set',
      'box',
      'pair',
      'mm',
      'kg',
      'litre',
      'piece',
    ]);
    expect(result.rows[4]?.standardPurchaseLengthMm).toBe(6000);
  });

  it('maps internal fabrication labels to boolean values', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit,Internally Fabricated',
        'P-100,,Main bearing,Acme Supplies,SUP-100,Zinc,Bearings,Bearing,piece,1',
        'P-101,,Second bearing,Acme Supplies,SUP-101,Zinc,Bearings,Bearing,piece,n',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result.errors).toEqual([]);
    expect(result.rows.map((row) => row.isInternallyFabricated)).toEqual([true, false]);
  });

  it('reports missing required headers', () => {
    const result = parsePartBulkImportCsv('Code,Description\nP-100,Main bearing', { hasHeader: true });

    expect(result.rows).toEqual([]);
    expect(result.errors).toContain('Missing required column: Supplier.');
  });

  it('blocks rows when the CSV parser reports file-level errors', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit,Internally Fabricated',
        'P-100,,"Main bearing,Acme Supplies,SUP-100,Zinc,Bearings,Bearing,quantity,true',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toContain('CSV parse error: Quoted field unterminated');
  });

  it('keeps valid rows while reporting row-numbered validation errors', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit,Internally Fabricated',
        ',,Main bearing,Acme Supplies,SUP-100,Zinc,Bearings,Bearing,piece,true',
        'P-101,,Second bearing,Acme Supplies,SUP-101,Zinc,Bearings,Bearing,piece,false',
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
        isInternallyFabricated: false,
        lineNumber: 3,
        name: 'Bearing',
        supplierCode: 'SUP-101',
        supplierName: 'Acme Supplies',
        unitOfMeasure: 'piece',
      },
    ]);
    expect(result.errors).toContain('Row 2: Code - Part code is required');
  });

  it('reports row-numbered errors for missing and unknown units', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit,Internally Fabricated',
        'P-100,,Main bearing,Acme Supplies,SUP-100,Zinc,Bearings,Bearing,,true',
        'P-101,,Second bearing,Acme Supplies,SUP-101,Zinc,Bearings,Bearing,metres,false',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      'Row 2: Unit - Unit must be one of piece, set, box, pair, mm, kg, litre.',
      'Row 3: Unit - Unit must be one of piece, set, box, pair, mm, kg, litre.',
    ]);
  });

  it('reports row-numbered errors for missing and unknown internal fabrication values', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit,Internally Fabricated',
        'P-100,,Main bearing,Acme Supplies,SUP-100,Zinc,Bearings,Bearing,piece,',
        'P-101,,Second bearing,Acme Supplies,SUP-101,Zinc,Bearings,Bearing,piece,maybe',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      'Row 2: Internally Fabricated - Internally Fabricated must be one of true, false, yes, no, y, n, 1, or 0.',
      'Row 3: Internally Fabricated - Internally Fabricated must be one of true, false, yes, no, y, n, 1, or 0.',
    ]);
  });

  it('reports invalid column counts without a header', () => {
    const result = parsePartBulkImportCsv('P-100,Main bearing', { hasHeader: false });

    expect(result.rows).toEqual([]);
    expect(result.errors).toContain('Row 1: Expected 10 or 11 columns, found 2.');
  });

  it('requires a standard purchase length for millimetre parts', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit,Internally Fabricated',
        'P-100,,Main bearing,Acme Supplies,SUP-100,Zinc,Bearings,Bearing,mm,true',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toContain(
      'Row 2: Standard Purchase Length (mm) - Standard purchase length is required for millimetre parts',
    );
  });

  it('preserves technical tokens when formatting imported display values', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit,Internally Fabricated,Standard Purchase Length (mm)',
        'P-100,NC,Description,BOLT & NUT,SUP-100,BLACK,SS LOCK NUT,M10 X 120 HT SHCS BOLT,piece,yes,',
        'P-101,NC,Description,BOLT & NUT,SUP-101,GALV,HT UNC BOLT,1/2 X 2 HT UNC BOLT,mm,no,6000',
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
          isInternallyFabricated: true,
          lineNumber: 2,
          name: 'M10 X 120 HT SHCS Bolt',
          standardPurchaseLengthMm: null,
          supplierCode: 'SUP-100',
          supplierName: 'Bolt & Nut',
          unitOfMeasure: 'piece',
        },
        {
          category: 'HT UNC Bolt',
          code: 'P-101',
          description: 'Description',
          drawingCode: 'NC',
          finish: 'Galv',
          isInternallyFabricated: false,
          lineNumber: 3,
          name: '1/2 X 2 HT UNC Bolt',
          standardPurchaseLengthMm: 6000,
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
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit,Internally Fabricated',
        'P-100,NC,Description,BOLT & NUT,SUP-100,STAINLESS,FLATWASHER,M10 SPRINGWASHER,piece,false',
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
