import { type AuditListInput, type Business, DateIso, getBusinessAuditEntityTypes } from '@pkg/schema';
import type { ColumnFiltersState } from '@tanstack/react-table';

type DateRangeFilterValue = {
  end?: string;
  start?: string;
};

export type AuditTableFixedFilters = Partial<Pick<AuditListInput['filters'], 'entityIds' | 'entityTypes'>>;

export function getAuditListInputExtras(
  business: Business,
  columnFilters: ColumnFiltersState,
  fixedFilters: AuditTableFixedFilters = {},
) {
  const occurredAtRange = getDateRangeFilterValue(columnFilters, 'occurredAt');
  const occurredAtStart = occurredAtRange.start ? DateIso.parse(toLocalDayStartIso(occurredAtRange.start)) : undefined;
  const occurredAtEnd = occurredAtRange.end ? DateIso.parse(toLocalDayEndIso(occurredAtRange.end)) : undefined;

  return {
    business,
    filters: {
      actorUserIds: getMultiSelectFilterValue(columnFilters, 'actorUserId'),
      entityIds: fixedFilters.entityIds ?? [],
      entityTypes: fixedFilters.entityTypes ?? getEntityTypeFilterValue(business, columnFilters),
      ...(occurredAtStart ? { occurredAtStart } : {}),
      ...(occurredAtEnd ? { occurredAtEnd } : {}),
    },
  } satisfies Pick<AuditListInput, 'business' | 'filters'>;
}

function getMultiSelectFilterValue(columnFilters: ColumnFiltersState, id: 'actorUserId' | 'entityType'): string[] {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function getEntityTypeFilterValue(
  business: Business,
  columnFilters: ColumnFiltersState,
): AuditListInput['filters']['entityTypes'] {
  const allowedEntityTypes = new Set<string>(getBusinessAuditEntityTypes(business));

  return getMultiSelectFilterValue(columnFilters, 'entityType').filter((entityType) =>
    allowedEntityTypes.has(entityType),
  ) as AuditListInput['filters']['entityTypes'];
}

function getDateRangeFilterValue(columnFilters: ColumnFiltersState, id: 'occurredAt'): DateRangeFilterValue {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const range = value as { end?: unknown; start?: unknown };

  return {
    ...(typeof range.end === 'string' && range.end ? { end: range.end } : {}),
    ...(typeof range.start === 'string' && range.start ? { start: range.start } : {}),
  };
}

function toLocalDayStartIso(value: string): string | undefined {
  const dateParts = parseDateInput(value);

  if (!dateParts) {
    return undefined;
  }

  const [year, month, day] = dateParts;

  return toIsoString(new Date(year, month - 1, day, 0, 0, 0, 0));
}

function toLocalDayEndIso(value: string): string | undefined {
  const dateParts = parseDateInput(value);

  if (!dateParts) {
    return undefined;
  }

  const [year, month, day] = dateParts;

  return toIsoString(new Date(year, month - 1, day, 23, 59, 59, 999));
}

function parseDateInput(value: string): [number, number, number] | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));

  if (!year || !month || !day) {
    return undefined;
  }

  return [year, month, day];
}

function toIsoString(date: Date): string | undefined {
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
