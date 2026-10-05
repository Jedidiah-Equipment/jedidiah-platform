import type { ColumnFiltersState } from '@tanstack/react-table';

export type DateRangeFilterValue = { end?: string; start?: string };

/** A date-range filter's non-empty ends, from whatever the column holds. */
export function toDateRangeFilterValue(value: unknown): DateRangeFilterValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const range = value as { end?: unknown; start?: unknown };
  return {
    ...(typeof range.end === 'string' && range.end ? { end: range.end } : {}),
    ...(typeof range.start === 'string' && range.start ? { start: range.start } : {}),
  };
}

/** A multi-select filter's non-empty values, from whatever the column holds. */
export function toMultiSelectFilterValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

const columnFilterValue = (columnFilters: ColumnFiltersState, id: string) =>
  columnFilters.find((filter) => filter.id === id)?.value;

export const readDateRangeFilter = (columnFilters: ColumnFiltersState, id: string) =>
  toDateRangeFilterValue(columnFilterValue(columnFilters, id));

export const readMultiSelectFilter = (columnFilters: ColumnFiltersState, id: string) =>
  toMultiSelectFilterValue(columnFilterValue(columnFilters, id));
