import { QuoteInvoicedFilter, QuoteKind, type QuoteListInput, QuoteStatus, type UUID } from '@pkg/schema';
import type { ColumnFiltersState } from '@tanstack/react-table';

export function getQuoteListInputExtras(columnFilters: ColumnFiltersState, customerId?: UUID) {
  return {
    filters: {
      customerId: customerId ?? getIdFilterValue(columnFilters, 'customerCompanyName'),
      invoiced: getInvoicedFilterValue(columnFilters),
      kind: getKindFilterValue(columnFilters),
      productId: getIdFilterValue(columnFilters, 'productName'),
      salesPersonId: getIdFilterValue(columnFilters, 'salesPersonName'),
      statuses: getStatusFilterValues(columnFilters),
    },
  } satisfies Pick<QuoteListInput, 'filters'>;
}

function getStatusFilterValues(columnFilters: ColumnFiltersState) {
  const value = columnFilters.find((filter) => filter.id === 'status')?.value;

  return Array.isArray(value) ? value.filter((item): item is QuoteStatus => QuoteStatus.safeParse(item).success) : [];
}

function getKindFilterValue(columnFilters: ColumnFiltersState) {
  const value = columnFilters.find((filter) => filter.id === 'kind')?.value;
  const parsed = typeof value === 'string' ? QuoteKind.safeParse(value) : null;

  return parsed?.success ? parsed.data : undefined;
}

function getInvoicedFilterValue(columnFilters: ColumnFiltersState) {
  const value = columnFilters.find((filter) => filter.id === 'invoiceNumber')?.value;
  const parsed = typeof value === 'string' ? QuoteInvoicedFilter.safeParse(value) : null;

  return parsed?.success ? parsed.data : undefined;
}

export function getQuoteProductFilterValue(columnFilters: ColumnFiltersState) {
  return getIdFilterValue(columnFilters, 'productName');
}

function getIdFilterValue(
  columnFilters: ColumnFiltersState,
  id: 'customerCompanyName' | 'productName' | 'salesPersonName',
) {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}
