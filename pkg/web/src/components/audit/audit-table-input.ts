import { type AuditListInput, type Business, DateIso, getBusinessAuditEntityTypes } from '@pkg/schema';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { readDateRangeFilter, readMultiSelectFilter } from '@/components/data-table/column-filter-values.js';

export type AuditTableFixedFilters = Partial<Pick<AuditListInput['filters'], 'entityIds' | 'entityTypes'>>;

export function getAuditListInputExtras(
  business: Business,
  columnFilters: ColumnFiltersState,
  fixedFilters: AuditTableFixedFilters = {},
) {
  const occurredAtRange = readDateRangeFilter(columnFilters, 'occurredAt');
  const occurredAtStart = occurredAtRange.start ? DateIso.parse(toLocalDayStartIso(occurredAtRange.start)) : undefined;
  const occurredAtEnd = occurredAtRange.end ? DateIso.parse(toLocalDayEndIso(occurredAtRange.end)) : undefined;

  return {
    business,
    filters: {
      actorUserIds: readMultiSelectFilter(columnFilters, 'actorUserId'),
      entityIds: fixedFilters.entityIds ?? [],
      entityTypes: fixedFilters.entityTypes ?? getEntityTypeFilterValue(business, columnFilters),
      ...(occurredAtStart ? { occurredAtStart } : {}),
      ...(occurredAtEnd ? { occurredAtEnd } : {}),
    },
  } satisfies Pick<AuditListInput, 'business' | 'filters'>;
}

function getEntityTypeFilterValue(
  business: Business,
  columnFilters: ColumnFiltersState,
): AuditListInput['filters']['entityTypes'] {
  const allowedEntityTypes = new Set<string>(getBusinessAuditEntityTypes(business));

  return readMultiSelectFilter(columnFilters, 'entityType').filter((entityType) =>
    allowedEntityTypes.has(entityType),
  ) as AuditListInput['filters']['entityTypes'];
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
