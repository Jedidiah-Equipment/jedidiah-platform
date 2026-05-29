import {
  PartBulkImportRow,
  type PartBulkImportRow as PartBulkImportRowValue,
  PartUnitOfMeasure,
  type PartUnitOfMeasure as PartUnitOfMeasureValue,
} from '@pkg/schema';
import Papa from 'papaparse';

export const PART_BULK_IMPORT_COLUMNS = [
  'Code',
  'Drawing code',
  'Description',
  'Supplier',
  'Supplier Code',
  'Finish',
  'Catagory',
  'Name',
  'Unit',
  'Internally Fabricated',
] as const;

type PartBulkImportColumnKey =
  | 'category'
  | 'code'
  | 'description'
  | 'drawingCode'
  | 'finish'
  | 'isInternallyFabricated'
  | 'name'
  | 'supplierCode'
  | 'supplierName'
  | 'unitOfMeasure';

type ColumnDefinition = {
  key: PartBulkImportColumnKey;
  label: (typeof PART_BULK_IMPORT_COLUMNS)[number];
  normalizedHeaders: readonly string[];
};

type ParsePartBulkImportCsvOptions = {
  hasHeader: boolean;
};

export type ParsePartBulkImportCsvResult = {
  errors: string[];
  rows: PartBulkImportRowValue[];
};

const columnDefinitions: readonly ColumnDefinition[] = [
  { key: 'code', label: 'Code', normalizedHeaders: ['code'] },
  { key: 'drawingCode', label: 'Drawing code', normalizedHeaders: ['drawingcode'] },
  { key: 'description', label: 'Description', normalizedHeaders: ['description'] },
  { key: 'supplierName', label: 'Supplier', normalizedHeaders: ['supplier'] },
  { key: 'supplierCode', label: 'Supplier Code', normalizedHeaders: ['suppliercode'] },
  { key: 'finish', label: 'Finish', normalizedHeaders: ['finish'] },
  { key: 'category', label: 'Catagory', normalizedHeaders: ['catagory', 'category'] },
  { key: 'name', label: 'Name', normalizedHeaders: ['name'] },
  { key: 'unitOfMeasure', label: 'Unit', normalizedHeaders: ['unit', 'unitofmeasure', 'unitofmeasurement'] },
  {
    key: 'isInternallyFabricated',
    label: 'Internally Fabricated',
    normalizedHeaders: ['internallyfabricated', 'internalfabrication', 'internal'],
  },
];

const columnLabelsByKey = new Map<PartBulkImportColumnKey, string>(
  columnDefinitions.map((column) => [column.key, column.label]),
);

const preservedTechnicalTokens = new Set(['CSK', 'HT', 'SHCS', 'SQ', 'SS', 'UNC', 'UNF', 'X']);
const formattedFieldKeys = new Set<PartBulkImportColumnKey>(['category', 'finish', 'name', 'supplierName']);
const unitOfMeasureValues = new Set<string>(PartUnitOfMeasure.options);
const unitOfMeasureLabels = new Map<string, PartUnitOfMeasureValue>([
  ['millimetres', 'mm'],
  ['millimeters', 'mm'],
  ['quantity', 'quantity'],
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

    if (!options.hasHeader && dataRow.length !== columnDefinitions.length) {
      errors.push(`Row ${rowNumber}: Expected ${columnDefinitions.length} columns, found ${dataRow.length}.`);
      return;
    }

    if (options.hasHeader && dataRow.length < getRequiredColumnCount(columnIndexes.indexes)) {
      errors.push(`Row ${rowNumber}: Missing one or more expected columns.`);
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
        const label = typeof key === 'string' ? columnLabelsByKey.get(key as PartBulkImportColumnKey) : undefined;
        const message =
          key === 'unitOfMeasure'
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

function getPositionColumnIndexes(): { errors: string[]; indexes: Map<PartBulkImportColumnKey, number> } {
  return {
    errors: [],
    indexes: new Map(columnDefinitions.map((column, index) => [column.key, index])),
  };
}

function getHeaderColumnIndexes(headers: readonly string[]): {
  errors: string[];
  indexes: Map<PartBulkImportColumnKey, number>;
} {
  const normalizedHeaders = headers.map(normalizeHeader);
  const errors: string[] = [];
  const indexes = new Map<PartBulkImportColumnKey, number>();

  for (const column of columnDefinitions) {
    const index = normalizedHeaders.findIndex((header) => column.normalizedHeaders.includes(header));

    if (index === -1) {
      errors.push(`Missing required column: ${column.label}.`);
      continue;
    }

    indexes.set(column.key, index);
  }

  return { errors, indexes };
}

function buildRowInput(
  row: readonly string[],
  indexes: ReadonlyMap<PartBulkImportColumnKey, number>,
): Record<PartBulkImportColumnKey, string | boolean | null> {
  return {
    category: getFormattedCell(row, indexes, 'category'),
    code: getCell(row, indexes, 'code'),
    description: getCell(row, indexes, 'description'),
    drawingCode: getCell(row, indexes, 'drawingCode'),
    finish: getFormattedCell(row, indexes, 'finish'),
    isInternallyFabricated: getBooleanCell(row, indexes, 'isInternallyFabricated'),
    name: getFormattedCell(row, indexes, 'name'),
    supplierCode: getCell(row, indexes, 'supplierCode'),
    supplierName: getFormattedCell(row, indexes, 'supplierName'),
    unitOfMeasure: getUnitOfMeasureCell(row, indexes),
  };
}

function getCell(
  row: readonly string[],
  indexes: ReadonlyMap<PartBulkImportColumnKey, number>,
  key: PartBulkImportColumnKey,
): string {
  const index = indexes.get(key);

  return index === undefined ? '' : (row[index] ?? '');
}

function getFormattedCell(
  row: readonly string[],
  indexes: ReadonlyMap<PartBulkImportColumnKey, number>,
  key: PartBulkImportColumnKey,
): string {
  const value = getCell(row, indexes, key);

  return formattedFieldKeys.has(key) ? formatPartImportDisplayValue(value) : value;
}

function getBooleanCell(
  row: readonly string[],
  indexes: ReadonlyMap<PartBulkImportColumnKey, number>,
  key: PartBulkImportColumnKey,
): boolean | string {
  const value = getCell(row, indexes, key).trim();

  return booleanLabels.get(value.toLowerCase()) ?? value;
}

function getUnitOfMeasureCell(
  row: readonly string[],
  indexes: ReadonlyMap<PartBulkImportColumnKey, number>,
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

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replaceAll(/\s+/g, '');
}

function getRequiredColumnCount(indexes: ReadonlyMap<PartBulkImportColumnKey, number>): number {
  return Math.max(...indexes.values()) + 1;
}
