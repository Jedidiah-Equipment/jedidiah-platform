import { PartBulkExportRow } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  buildPartBulkExportCsv,
  createPartBulkExportFilename,
  PART_BULK_CSV_COLUMN_KEYS,
  parsePartBulkImportCsv,
} from './part-bulk-csv.js';

type PartBulkExportRowValue = PartBulkExportRow;

/**
 * The export writes what the import reads. These rows travel out and back, and a column that moved
 * on one side without moving on the other lands its value in the wrong field here.
 */
const roundTripRows: PartBulkExportRowValue[] = [
  {
    category: 'Bearings',
    code: 'P-100',
    description: 'Main bearing, front',
    drawingCode: 'DR-100',
    finish: 'Galv',
    isInternallyFabricated: false,
    name: 'Bearing',
    standardPurchaseLengthMm: null,
    supplierCode: 'SUP-100',
    supplierName: 'Acme Supplies',
    unitOfMeasure: 'piece',
  },
  {
    category: 'Frames',
    code: '-450',
    description: 'Weldment "A" frame',
    drawingCode: null,
    finish: 'Powder Coat',
    isInternallyFabricated: true,
    name: 'A Frame',
    standardPurchaseLengthMm: null,
    supplierCode: 'INT-450',
    supplierName: null,
    unitOfMeasure: 'set',
  },
  {
    category: 'Bar Stock',
    code: 'P-900',
    description: 'Round bar',
    drawingCode: 'DR-900',
    finish: 'Black',
    isInternallyFabricated: false,
    name: 'M30 SS Bar',
    standardPurchaseLengthMm: 6000,
    supplierCode: 'SUP-900',
    supplierName: 'Acme Supplies',
    unitOfMeasure: 'mm',
  },
  // A Part whose own value starts with the marker the export writes. Both must survive, or the
  // export's escape and the import's unescape are not inverses and a Code can be rewritten in transit.
  {
    category: 'Bar Stock',
    code: "'-450",
    description: "'quoted' stock",
    drawingCode: null,
    finish: 'Black',
    isInternallyFabricated: false,
    name: "'A' Section",
    standardPurchaseLengthMm: null,
    supplierCode: "'INT",
    supplierName: 'Acme Supplies',
    unitOfMeasure: 'piece',
  },
];

describe('bulk Part CSV round trip', () => {
  it('reads back every exported row unchanged when the header is used', () => {
    const result = parsePartBulkImportCsv(buildPartBulkExportCsv(roundTripRows), { hasHeader: true });

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual(roundTripRows.map((row, index) => ({ ...row, lineNumber: index + 2 })));
  });

  it('reads back every exported row unchanged by column position alone', () => {
    const csv = buildPartBulkExportCsv(roundTripRows);
    const withoutHeader = csv.slice(csv.indexOf('\r\n') + 2);

    const result = parsePartBulkImportCsv(withoutHeader, { hasHeader: false });

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual(roundTripRows.map((row, index) => ({ ...row, lineNumber: index + 1 })));
  });

  it('carries every field of a CSV row in a column', () => {
    // The round-trip tests above can only catch a field that both sides already know about. This is
    // what fails when a field is added to the schema and to nothing else: it would be silently
    // dropped on the way out and left at its old value on the way back in.
    expect([...PART_BULK_CSV_COLUMN_KEYS].sort()).toEqual(Object.keys(PartBulkExportRow.shape).sort());
  });

  it('names the file by the day it was taken', () => {
    expect(createPartBulkExportFilename(new Date('2026-08-13T09:00:00Z'))).toBe('parts-2026-08-13.csv');
  });

  it('names a Supplier-scoped file after the Supplier, so two taken the same day differ', () => {
    const date = new Date('2026-08-13T09:00:00Z');

    expect(createPartBulkExportFilename(date, 'Acme Supplies')).toBe('parts-acme-supplies-2026-08-13.csv');
    expect(createPartBulkExportFilename(date, 'Böhler / Uddeholm (Pty) Ltd')).toBe(
      'parts-bohler-uddeholm-pty-ltd-2026-08-13.csv',
    );
  });
});

describe('parsePartBulkImportCsv', () => {
  it('parses CSV with the expected header', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit,Internally Fabricated,Standard Purchase Length (mm)',
        ' P-100, DR-100, Main bearing, Acme Supplies, SUP-100, BLACK, PLAIN NUT, M30 PLAIN NUT, mm, no, 6000 ',
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
          isInternallyFabricated: false,
          lineNumber: 2,
          name: 'M30 Plain Nut',
          standardPurchaseLengthMm: 6000,
          supplierCode: 'SUP-100',
          supplierName: 'Acme Supplies',
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
          standardPurchaseLengthMm: null,
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

    expect(result.errors).toEqual(['Row 1: Missing one or more expected columns.']);
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
        'P-100,,Main bearing,,SUP-100,Zinc,Bearings,Bearing,piece,1',
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
        standardPurchaseLengthMm: null,
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

  it('states why a built Part cannot be linear rather than listing the units it accepts', () => {
    const result = parsePartBulkImportCsv(
      [
        'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Catagory ,Name,Unit,Internally Fabricated,Standard Purchase Length (mm)',
        'FAB1-0009,,Mounting bracket,,FAB1-0009,Zinc,Brackets,Bracket,mm,yes,6000',
      ].join('\n'),
      { hasHeader: true },
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual(['Row 2: Unit - A built Part cannot be measured in millimetres']);
  });

  it('reports invalid column counts without a header', () => {
    const result = parsePartBulkImportCsv('P-100,Main bearing', { hasHeader: false });

    expect(result.rows).toEqual([]);
    expect(result.errors).toContain('Row 1: Missing one or more expected columns.');
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
        'P-100,NC,Description,,SUP-100,BLACK,SS LOCK NUT,M10 X 120 HT SHCS BOLT,piece,yes,',
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
          supplierName: null,
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
