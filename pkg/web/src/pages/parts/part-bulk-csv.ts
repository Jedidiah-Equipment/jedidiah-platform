import { formatDate } from '@pkg/domain';
import {
  type PartBulkExportRow,
  PartBulkImportRow,
  type PartBulkImportRow as PartBulkImportRowValue,
  PartUnitOfMeasure,
  type PartUnitOfMeasure as PartUnitOfMeasureValue,
} from '@pkg/schema';
import Papa from 'papaparse';

import { downloadCsv } from '@/utils/csv-export.js';

type PartBulkCsvColumnKey =
  | 'category'
  | 'code'
  | 'description'
  | 'drawingCode'
  | 'finish'
  | 'isInternallyFabricated'
  | 'name'
  | 'standardPurchaseLengthMm'
  | 'supplierCode'
  | 'supplierName'
  | 'unitOfMeasure';

type ColumnDefinition = {
  key: PartBulkCsvColumnKey;
  label: string;
  normalizedHeaders: readonly string[];
  /** Optional columns sit at the end of the template so a shorter legacy row still lines up. */
  required: boolean;
  /** What the export writes for this column. Must be a value `normalizedHeaders`' column can read back. */
  toCell: (row: PartBulkExportRow) => string;
};

type ParsePartBulkImportCsvOptions = {
  hasHeader: boolean;
};

export type ParsePartBulkImportCsvResult = {
  errors: string[];
  rows: PartBulkImportRowValue[];
};

/**
 * The one ordered column contract, read by the import and written by the export.
 *
 * Both directions derive their column order, their header text and their cell values from this list,
 * so the two cannot drift: a column added here appears in the export and is read by the import at the
 * same index, which is what keeps a headerless file — matched by position alone — lining up.
 */
const columnDefinitions: readonly ColumnDefinition[] = [
  { key: 'code', label: 'Code', normalizedHeaders: ['code'], required: true, toCell: (row) => row.code },
  {
    key: 'drawingCode',
    label: 'Drawing code',
    normalizedHeaders: ['drawingcode'],
    required: true,
    toCell: (row) => row.drawingCode ?? '',
  },
  {
    key: 'description',
    label: 'Description',
    normalizedHeaders: ['description'],
    required: true,
    toCell: (row) => row.description,
  },
  {
    key: 'supplierName',
    label: 'Supplier',
    normalizedHeaders: ['supplier'],
    required: true,
    // Blank on a built Part, which the import reads back as "bought from nobody".
    toCell: (row) => row.supplierName ?? '',
  },
  {
    key: 'supplierCode',
    label: 'Supplier Code',
    normalizedHeaders: ['suppliercode'],
    required: true,
    toCell: (row) => row.supplierCode,
  },
  { key: 'finish', label: 'Finish', normalizedHeaders: ['finish'], required: true, toCell: (row) => row.finish },
  {
    key: 'category',
    label: 'Catagory',
    normalizedHeaders: ['catagory', 'category'],
    required: true,
    toCell: (row) => row.category,
  },
  { key: 'name', label: 'Name', normalizedHeaders: ['name'], required: true, toCell: (row) => row.name },
  {
    key: 'unitOfMeasure',
    label: 'Unit',
    normalizedHeaders: ['unit', 'unitofmeasure', 'unitofmeasurement'],
    required: true,
    toCell: (row) => row.unitOfMeasure,
  },
  {
    key: 'isInternallyFabricated',
    label: 'Internally Fabricated',
    normalizedHeaders: ['internallyfabricated', 'internalfabrication', 'internal'],
    required: true,
    toCell: (row) => (row.isInternallyFabricated ? 'Yes' : 'No'),
  },
  {
    key: 'standardPurchaseLengthMm',
    label: 'Standard Purchase Length (mm)',
    normalizedHeaders: ['standardpurchaselength', 'standardpurchaselengthmm'],
    required: false,
    toCell: (row) => (row.standardPurchaseLengthMm == null ? '' : String(row.standardPurchaseLengthMm)),
  },
];

/** Derived, never hand-listed: the header the export writes is the header the import documents. */
export const PART_BULK_CSV_COLUMNS: readonly string[] = columnDefinitions.map((column) => column.label);

/** The column each field of a CSV row is carried by, in file order. Tested against the schema. */
export const PART_BULK_CSV_COLUMN_KEYS: readonly PartBulkCsvColumnKey[] = columnDefinitions.map((column) => column.key);

const columnLabelsByKey = new Map<PartBulkCsvColumnKey, string>(
  columnDefinitions.map((column) => [column.key, column.label]),
);

/**
 * The characters a spreadsheet would read as the start of a formula, plus the apostrophe the export
 * marks them with. Including the apostrophe is what makes the marking reversible: a value that
 * already starts with one is marked too, so the import can always strip exactly one and land back on
 * the original. Papa's own default omits the apostrophe, which loses `'-450` on the way home.
 */
const FORMULA_LEAD = /^['=+\-@\t\r]/;

export function buildPartBulkExportCsv(rows: readonly PartBulkExportRow[]): string {
  return Papa.unparse(
    {
      fields: [...PART_BULK_CSV_COLUMNS],
      data: rows.map((row) => columnDefinitions.map((column) => column.toCell(row))),
    },
    { escapeFormulae: FORMULA_LEAD },
  );
}

export function createPartBulkExportFilename(date: Date): string {
  return `parts-${formatDate(date, 'yyyy-MM-dd')}.csv`;
}

export function downloadPartBulkExport(rows: readonly PartBulkExportRow[]): void {
  downloadCsv(buildPartBulkExportCsv(rows), createPartBulkExportFilename(new Date()));
}

const preservedTechnicalTokens = new Set(['CSK', 'HT', 'SHCS', 'SQ', 'SS', 'UNC', 'UNF', 'X']);
const formattedFieldKeys = new Set<PartBulkCsvColumnKey>(['category', 'finish', 'name', 'supplierName']);
const unitOfMeasureValues = new Set<string>(PartUnitOfMeasure.options);
const unitOfMeasureLabels = new Map<string, PartUnitOfMeasureValue>([
  ['box', 'box'],
  ['boxes', 'box'],
  ['kilogram', 'kg'],
  ['kilograms', 'kg'],
  ['liter', 'litre'],
  ['liters', 'litre'],
  ['litre', 'litre'],
  ['litres', 'litre'],
  ['millimetre', 'mm'],
  ['millimetres', 'mm'],
  ['millimeter', 'mm'],
  ['millimeters', 'mm'],
  ['pair', 'pair'],
  ['pairs', 'pair'],
  ['piece', 'piece'],
  ['pieces', 'piece'],
  ['quantity', 'piece'],
  ['set', 'set'],
  ['sets', 'set'],
]);
const booleanLabels = new Map<string, boolean>([
  ['0', false],
  ['1', true],
  ['false', false],
  ['n', false],
  ['no', false],
  ['true', true],
  ['y', true],
  ['yes', true],
]);

export function parsePartBulkImportCsv(
  csvText: string,
  options: ParsePartBulkImportCsvOptions,
): ParsePartBulkImportCsvResult {
  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: 'greedy',
  });
  const parseErrors = parsed.errors.map((error) => `CSV parse error: ${error.message}`);
  const errors = [...parseErrors];
  const table = parsed.data;

  if (table.length === 0) {
    return {
      errors: ['CSV file is empty.'],
      rows: [],
    };
  }

  const columnIndexes = options.hasHeader ? getHeaderColumnIndexes(table[0] ?? []) : getPositionColumnIndexes();

  if (parseErrors.length > 0) {
    return {
      errors,
      rows: [],
    };
  }

  if (columnIndexes.errors.length > 0) {
    return {
      errors: [...errors, ...columnIndexes.errors],
      rows: [],
    };
  }

  const dataRows = options.hasHeader ? table.slice(1) : table;

  if (dataRows.length === 0) {
    return {
      errors: [...errors, 'CSV file does not contain any part rows.'],
      rows: [],
    };
  }

  const rows: PartBulkImportRowValue[] = [];

  dataRows.forEach((dataRow, index) => {
    const rowNumber = options.hasHeader ? index + 2 : index + 1;

    // Trailing optional columns may simply be absent; every required cell must be present.
    if (dataRow.length < requiredCellCount(columnIndexes.indexes)) {
      errors.push(`Row ${rowNumber}: Missing one or more expected columns.`);
      return;
    }

    if (!options.hasHeader && dataRow.length > columnDefinitions.length) {
      errors.push(`Row ${rowNumber}: Expected at most ${columnDefinitions.length} columns, found ${dataRow.length}.`);
      return;
    }

    const rowInput = {
      ...buildRowInput(dataRow, columnIndexes.indexes),
      lineNumber: rowNumber,
    };
    const result = PartBulkImportRow.safeParse(rowInput);

    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        const label = typeof key === 'string' ? columnLabelsByKey.get(key as PartBulkCsvColumnKey) : undefined;
        // A rule that judges the row rather than the cell states its own reason; only a cell the
        // parser could not read at all is answered with the list of values it accepts.
        const message =
          issue.code === 'custom'
            ? issue.message
            : key === 'unitOfMeasure'
              ? `Unit must be one of ${PartUnitOfMeasure.options.join(', ')}.`
              : key === 'isInternallyFabricated'
                ? 'Internally Fabricated must be one of true, false, yes, no, y, n, 1, or 0.'
                : issue.message;
        errors.push(`Row ${rowNumber}: ${label ?? 'Value'} - ${message}`);
      }
      return;
    }

    rows.push(result.data);
  });

  return {
    errors,
    rows,
  };
}

function getPositionColumnIndexes(): { errors: string[]; indexes: Map<PartBulkCsvColumnKey, number> } {
  return { errors: [], indexes: new Map(columnDefinitions.map((column, index) => [column.key, index])) };
}

function getHeaderColumnIndexes(headers: readonly string[]): {
  errors: string[];
  indexes: Map<PartBulkCsvColumnKey, number>;
} {
  const normalizedHeaders = headers.map(normalizeHeader);
  const errors: string[] = [];
  const indexes = new Map<PartBulkCsvColumnKey, number>();

  for (const column of columnDefinitions) {
    const index = normalizedHeaders.findIndex((header) => column.normalizedHeaders.includes(header));

    if (index === -1) {
      if (column.required) errors.push(`Missing required column: ${column.label}.`);
      continue;
    }

    indexes.set(column.key, index);
  }

  return { errors, indexes };
}

function buildRowInput(
  row: readonly string[],
  indexes: ReadonlyMap<PartBulkCsvColumnKey, number>,
): Record<PartBulkCsvColumnKey, string | number | boolean | null> {
  return {
    category: getFormattedCell(row, indexes, 'category'),
    code: getCell(row, indexes, 'code'),
    description: getCell(row, indexes, 'description'),
    drawingCode: getCell(row, indexes, 'drawingCode'),
    finish: getFormattedCell(row, indexes, 'finish'),
    isInternallyFabricated: getBooleanCell(row, indexes, 'isInternallyFabricated'),
    name: getFormattedCell(row, indexes, 'name'),
    standardPurchaseLengthMm: getOptionalIntegerCell(row, indexes, 'standardPurchaseLengthMm'),
    supplierCode: getCell(row, indexes, 'supplierCode'),
    // A built Part row leaves the Supplier cell blank — it is made in-house and bought from nobody.
    supplierName: getFormattedCell(row, indexes, 'supplierName') || null,
    unitOfMeasure: getUnitOfMeasureCell(row, indexes),
  };
}

function getCell(
  row: readonly string[],
  indexes: ReadonlyMap<PartBulkCsvColumnKey, number>,
  key: PartBulkCsvColumnKey,
): string {
  const index = indexes.get(key);

  return index === undefined ? '' : unescapeFormulaCell(row[index] ?? '');
}

/**
 * Undoes the apostrophe the export writes so a spreadsheet does not read a cell as a formula, and
 * only that apostrophe: it is dropped exactly where `FORMULA_LEAD` would have put one, which makes
 * the pair a bijection. A Part code of `-450` comes home as `-450` rather than `'-450`, and one that
 * genuinely reads `'-450` comes home unchanged rather than being rewritten into a different Part.
 */
function unescapeFormulaCell(value: string): string {
  return value.startsWith("'") && FORMULA_LEAD.test(value.slice(1)) ? value.slice(1) : value;
}

function getFormattedCell(
  row: readonly string[],
  indexes: ReadonlyMap<PartBulkCsvColumnKey, number>,
  key: PartBulkCsvColumnKey,
): string {
  const value = getCell(row, indexes, key);

  return formattedFieldKeys.has(key) ? formatPartImportDisplayValue(value) : value;
}

function getBooleanCell(
  row: readonly string[],
  indexes: ReadonlyMap<PartBulkCsvColumnKey, number>,
  key: PartBulkCsvColumnKey,
): boolean | string {
  const value = getCell(row, indexes, key).trim();

  return booleanLabels.get(value.toLowerCase()) ?? value;
}

function getOptionalIntegerCell(
  row: readonly string[],
  indexes: ReadonlyMap<PartBulkCsvColumnKey, number>,
  key: PartBulkCsvColumnKey,
): number | string | null {
  const value = getCell(row, indexes, key).trim();
  if (!value) return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : value;
}

function getUnitOfMeasureCell(
  row: readonly string[],
  indexes: ReadonlyMap<PartBulkCsvColumnKey, number>,
): PartUnitOfMeasureValue | string {
  const value = getCell(row, indexes, 'unitOfMeasure').trim();
  const normalizedValue = value.toLowerCase();

  if (unitOfMeasureValues.has(normalizedValue)) {
    return normalizedValue as PartUnitOfMeasureValue;
  }

  return unitOfMeasureLabels.get(normalizeUnitOfMeasureLabel(value)) ?? value;
}

function normalizeUnitOfMeasureLabel(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, '');
}

function formatPartImportDisplayValue(value: string): string {
  return value
    .trim()
    .split(/(\s+)/)
    .map((part) => (part.trim() ? formatPartImportDisplayToken(part) : part))
    .join('');
}

function formatPartImportDisplayToken(token: string): string {
  if (isPreservedTechnicalToken(token)) {
    return token.toUpperCase();
  }

  return token.replaceAll(/[A-Za-z]+/g, (word) => formatWord(word));
}

function isPreservedTechnicalToken(token: string): boolean {
  const normalizedToken = token.toUpperCase();

  return (
    preservedTechnicalTokens.has(normalizedToken) ||
    /^M\d+(?:\.\d+)?$/i.test(token) ||
    /^\([A-Z]\)$/i.test(token) ||
    /^\d+(?:\/\d+)?"?$/.test(token)
  );
}

function formatWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Drops punctuation as well as spacing, so a labelled unit like "Length (mm)" still matches. */
function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, '');
}

/** How many cells a row must hold to reach every required column at its resolved position. */
function requiredCellCount(indexes: ReadonlyMap<PartBulkCsvColumnKey, number>): number {
  const requiredIndexes = columnDefinitions.flatMap((column) => {
    const index = indexes.get(column.key);

    return column.required && index !== undefined ? [index] : [];
  });

  return requiredIndexes.length === 0 ? 0 : Math.max(...requiredIndexes) + 1;
}
