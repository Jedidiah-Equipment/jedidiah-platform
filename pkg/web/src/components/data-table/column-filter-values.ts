import { DateOnlyIso } from '@pkg/schema';
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

/**
 * A date-range filter as the two calendar-day fields a list input takes, named by `keys`; an end the column does not
 * hold as a valid date is left out rather than sent as undefined.
 */
export function readDateOnlyRangeFilter<FromKey extends string, ToKey extends string>(
  columnFilters: ColumnFiltersState,
  id: string,
  [fromKey, toKey]: readonly [FromKey, ToKey],
): Partial<Record<FromKey | ToKey, DateOnlyIso>> {
  const { start, end } = readDateRangeFilter(columnFilters, id);
  const range: Partial<Record<FromKey | ToKey, DateOnlyIso>> = {};
  const from = DateOnlyIso.safeParse(start).data;
  const to = DateOnlyIso.safeParse(end).data;
  if (from) range[fromKey] = from;
  if (to) range[toKey] = to;
  return range;
}

const sameValues = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value) => right.includes(value));

/** Exactly these values are picked in the multi-select filter. */
export const isPickedExactly = (columnFilters: ColumnFiltersState, id: string, values: readonly string[]) =>
  sameValues(readMultiSelectFilter(columnFilters, id), values);

/** Picks exactly these values, keeping the other filters; picking them again clears the pick. */
export function togglePick(
  columnFilters: ColumnFiltersState,
  id: string,
  values: readonly string[],
): ColumnFiltersState {
  const others = columnFilters.filter((filter) => filter.id !== id);
  return isPickedExactly(columnFilters, id, values) ? others : [...others, { id, value: [...values] }];
}
