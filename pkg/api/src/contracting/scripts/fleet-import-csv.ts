import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PhoneNumber } from '@pkg/schema';
import {
  CategoryColour,
  CategoryIconKey,
  CategoryKind,
  FleetCode,
  FleetHours,
  MachineYear,
  ServiceIntervalHours,
} from '@pkg/schema/contracting';
import { z } from 'zod';

export type FleetImportFileName = 'categories' | 'implements' | 'machines' | 'people';
export type FleetImportFiles = Record<FleetImportFileName, string>;

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value));
const optionalNumber = optionalText.transform((value) => (value === null ? null : Number(value)));
const requiredText = (label: string) => z.string().trim().min(1, `${label} is required`);

export const FleetImportCategory = z.object({
  name: requiredText('name'),
  kind: CategoryKind,
  icon: CategoryIconKey,
  colour: CategoryColour,
});
export type FleetImportCategory = z.infer<typeof FleetImportCategory>;

export const FleetImportMachine = z.object({
  code: FleetCode,
  make: requiredText('make'),
  model: requiredText('model'),
  year: optionalNumber.pipe(MachineYear.nullable()),
  registration: optionalText,
  category: requiredText('category'),
  current_driver: optionalText,
  service_interval_hours: optionalNumber.pipe(ServiceIntervalHours.nullable()),
  next_service_due_hours: optionalNumber.pipe(FleetHours.nullable()),
  notes: optionalText,
});
export type FleetImportMachine = z.infer<typeof FleetImportMachine>;

export const FleetImportImplement = z.object({
  category: requiredText('category'),
  code: optionalText.pipe(FleetCode.nullable()),
  notes: optionalText,
});
export type FleetImportImplement = z.infer<typeof FleetImportImplement>;

export const FleetImportPerson = z.object({
  name: requiredText('name'),
  role: z.enum(['driver', 'mechanic']),
  phone: optionalText.transform(normalisePhone).pipe(PhoneNumber.nullable()),
});
export type FleetImportPerson = z.infer<typeof FleetImportPerson>;

export type FleetImportData = {
  categories: FleetImportCategory[];
  machines: FleetImportMachine[];
  implements: FleetImportImplement[];
  people: FleetImportPerson[];
};

export class FleetImportCsvError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Fleet import CSVs are invalid:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'FleetImportCsvError';
  }
}

/** Sheet phone columns arrive as `082 000 0001`; the user record wants `+27820000001`. */
function normalisePhone(value: string | null): string | null {
  if (value === null) return null;
  const digits = value.replace(/[\s()-]/g, '');
  if (/^0\d{9}$/.test(digits)) return `+27${digits.slice(1)}`;
  if (/^27\d{9}$/.test(digits)) return `+${digits}`;
  return digits;
}

/** RFC 4180: comma-separated, double-quoted fields with `""` escapes, CRLF or LF, header row first. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  const columns = header.map((column) => column.trim());
  return body
    .filter((cells) => cells.some((cell) => cell.trim() !== ''))
    .map((cells) => Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? ''])));
}

function parseRows<T>(file: FleetImportFileName, text: string, schema: z.ZodType<T>, issues: string[]): T[] {
  const parsed: T[] = [];
  parseCsv(text).forEach((record, index) => {
    const line = index + 2;
    const result = schema.safeParse(record);
    if (result.success) parsed.push(result.data);
    else
      for (const issue of result.error.issues)
        issues.push(`${file}.csv line ${line}: ${issue.path.join('.') || 'row'} — ${issue.message}`);
  });
  return parsed;
}

export const fleetImportFileNames: readonly FleetImportFileName[] = ['categories', 'machines', 'implements', 'people'];

export async function readFleetImportFiles(directory: string): Promise<FleetImportFiles> {
  const entries = await Promise.all(
    fleetImportFileNames.map(async (name) => [name, await readFile(path.join(directory, `${name}.csv`), 'utf8')]),
  );
  return Object.fromEntries(entries) as FleetImportFiles;
}

const key = (value: string) => value.trim().toLowerCase();
/** Category names are unique per kind, case-insensitively, so both take part in the lookup key. */
export const categoryKey = (kind: string, name: string) => `${kind}:${key(name)}`;

function checkUnique(file: FleetImportFileName, label: string, values: readonly string[], issues: string[]) {
  const seen = new Map<string, number>();
  values.forEach((value, index) => {
    const first = seen.get(key(value));
    if (first !== undefined) issues.push(`${file}.csv line ${index + 2}: ${label} "${value}" repeats line ${first}`);
    else seen.set(key(value), index + 2);
  });
}

/** Fails on every sheet problem at once, before the script touches the database. */
export function parseFleetImport(files: FleetImportFiles): FleetImportData {
  const issues: string[] = [];
  const categories = parseRows('categories', files.categories, FleetImportCategory, issues);
  const machines = parseRows('machines', files.machines, FleetImportMachine, issues);
  const implementsRows = parseRows('implements', files.implements, FleetImportImplement, issues);
  const people = parseRows('people', files.people, FleetImportPerson, issues);
  if (issues.length > 0) throw new FleetImportCsvError(issues);

  checkUnique(
    'categories',
    'category',
    categories.map((category) => `${category.kind}:${category.name}`),
    issues,
  );
  checkUnique(
    'machines',
    'code',
    machines.map((machine) => machine.code),
    issues,
  );
  checkUnique(
    'implements',
    'code',
    implementsRows.flatMap((implement) => (implement.code ? [implement.code] : [])),
    issues,
  );
  checkUnique(
    'people',
    'name',
    people.map((person) => person.name),
    issues,
  );

  const categoryKinds = new Map(categories.map((category) => [key(category.name), category.kind]));
  const drivers = new Set(people.filter((person) => person.role === 'driver').map((person) => key(person.name)));
  machines.forEach((machine, index) => {
    const line = index + 2;
    if (categoryKinds.get(key(machine.category)) !== 'machine')
      issues.push(`machines.csv line ${line}: category "${machine.category}" is not a machine category`);
    if (machine.current_driver && !drivers.has(key(machine.current_driver)))
      issues.push(
        `machines.csv line ${line}: current_driver "${machine.current_driver}" is not a driver in people.csv`,
      );
  });
  implementsRows.forEach((implement, index) => {
    if (categoryKinds.get(key(implement.category)) !== 'implement')
      issues.push(`implements.csv line ${index + 2}: category "${implement.category}" is not an implement category`);
  });
  if (issues.length > 0) throw new FleetImportCsvError(issues);
  return { categories, machines, implements: implementsRows, people };
}
