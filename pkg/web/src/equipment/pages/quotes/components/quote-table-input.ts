import type { UUID } from '@pkg/schema';
import { QuoteInvoicedFilter, QuoteKind, type QuoteListInput, QuoteStatus } from '@pkg/schema/equipment';
import type { ColumnFiltersState } from '@tanstack/react-table';
import type { z } from 'zod';

export function getQuoteListInputExtras(columnFilters: ColumnFiltersState, customerId?: UUID) {
  return {
    filters: {
      customerId: customerId ?? getQuoteIdFilterValue(columnFilters, 'customerCompanyName'),
      invoiced: getEnumFilterValue(columnFilters, 'invoiceNumber', QuoteInvoicedFilter),
      kind: getEnumFilterValue(columnFilters, 'kind', QuoteKind),
      productId: getQuoteIdFilterValue(columnFilters, 'productName'),
      salesPersonId: getQuoteIdFilterValue(columnFilters, 'salesPersonName'),
      statuses: getStatusFilterValues(columnFilters),
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

function getStatusFilterValues(columnFilters: ColumnFiltersState) {
  const value = columnFilters.find((filter) => filter.id === 'status')?.value;

  return Array.isArray(value) ? value.filter((item): item is QuoteStatus => QuoteStatus.safeParse(item).success) : [];
}

function getEnumFilterValue<TValue extends string>(
  columnFilters: ColumnFiltersState,
  id: 'invoiceNumber' | 'kind',
  schema: z.ZodEnum<Record<string, TValue>>,
): TValue | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;
  const parsed = typeof value === 'string' ? schema.safeParse(value) : null;

  return parsed?.success ? parsed.data : undefined;
}
