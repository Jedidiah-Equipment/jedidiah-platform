import type { UUID } from '@pkg/schema';
import { type QuoteListInput, QuoteOfferingType, QuoteStage } from '@pkg/schema/equipment';
import type { ColumnFiltersState } from '@tanstack/react-table';
import type { z } from 'zod';
import { readMultiSelectFilter } from '@/components/data-table/column-filter-values.js';

export function getQuoteListInputExtras(columnFilters: ColumnFiltersState, customerId?: UUID) {
  return {
    filters: {
      customerId: customerId ?? getQuoteIdFilterValue(columnFilters, 'customerCompanyName'),
      offeringType: getEnumFilterValue(columnFilters, 'offeringType', QuoteOfferingType),
      productId: getQuoteIdFilterValue(columnFilters, 'productName'),
      salesPersonId: getQuoteIdFilterValue(columnFilters, 'salesPersonName'),
      stages: getStageFilterValues(columnFilters),
    },
  } satisfies Pick<QuoteListInput, 'filters'>;
}

export function getQuoteIdFilterValue(
  columnFilters: ColumnFiltersState,
  id: 'customerCompanyName' | 'productName' | 'salesPersonName',
) {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}

function getStageFilterValues(columnFilters: ColumnFiltersState) {
  return readMultiSelectFilter(columnFilters, 'stage').filter(
    (item): item is QuoteStage => QuoteStage.safeParse(item).success,
  );
}

function getEnumFilterValue<TValue extends string>(
  columnFilters: ColumnFiltersState,
  id: 'offeringType',
  schema: z.ZodEnum<Record<string, TValue>>,
): TValue | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;
  const parsed = typeof value === 'string' ? schema.safeParse(value) : null;

  return parsed?.success ? parsed.data : undefined;
}
