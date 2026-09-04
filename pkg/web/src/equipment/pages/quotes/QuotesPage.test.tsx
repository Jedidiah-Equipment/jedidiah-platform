import { formatCurrency, formatDate } from '@pkg/domain';
import { PriorityQuote, type PriorityQuote as PriorityQuoteType } from '@pkg/schema/equipment';
import { addDays, format as formatDateFns } from 'date-fns';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useDataTable } from '@/components/data-table/features.js';

import {
  createPriorityQuoteTableRow,
  createQuoteTableColumns,
  createQuoteTableRow,
  getQuoteTableRowClassName,
  type QuoteTableRow,
  quoteTablePinnedEndColumns,
  quoteTablePinnedStartColumns,
} from './components/QuoteTableColumns.js';

describe('Quote table priority rows', () => {
  it('renders the warning indicator, both delivery dates, and emphasizes the earliest date', () => {
    // Use future dates so the delivery lines always render as absolute dates;
    // a date that lands on "today" renders relatively (e.g. "Today at 00:00").
    const preferred = toDateOnly(addDays(new Date(), 30));
    const planned = toDateOnly(addDays(new Date(), 60));
    const html = renderQuoteTableRows([
      createPriorityQuoteTableRow(
        buildPriorityQuote({
          code: 'QUO-00001',
          earliestDeliveryDate: preferred,
          plannedDeliveryDate: planned,
          preferredDeliveryDate: preferred,
        }),
      ),
    ]);

    expect(html).toContain('aria-label="Needs job"');
    expect(html).toContain('No job');
    expect(html).toContain('Preferred');
    expect(html).toContain(formatDate(preferred, 'short'));
    expect(html).toContain('Planned');
    expect(html).toContain(formatDate(planned, 'short'));
    expect(html).toContain('data-priority-date="earliest"');
  });

  it('preserves the priority order provided by the read model', () => {
    const html = renderQuoteTableRows([
      createPriorityQuoteTableRow(
        buildPriorityQuote({ code: 'QUO-00002', id: '22222222-2222-4222-8222-222222222222' }),
      ),
      createPriorityQuoteTableRow(
        buildPriorityQuote({ code: 'QUO-00001', id: '11111111-1111-4111-8111-111111111111' }),
      ),
    ]);

    expect(html.indexOf('QUO-00002')).toBeLessThan(html.indexOf('QUO-00001'));
  });

  it('does not deduplicate a priority row that also appears in normal table rows', () => {
    const quote = buildPriorityQuote({ code: 'QUO-00001' });
    const html = renderQuoteTableRows([createPriorityQuoteTableRow(quote), createQuoteTableRow(quote)]);

    expect(html.match(/>QUO-00001</g)).toHaveLength(2);
  });

  it('renders quote code start-pinned and status/job end-pinned', () => {
    const html = renderQuoteTableRows([
      createPriorityQuoteTableRow(buildPriorityQuote({ job: null })),
      createQuoteTableRow(buildPriorityQuote({ job: null })),
    ]);

    expect(html).toContain('inset-inline-start:0px');
    expect(html).toContain('inset-inline-end:144px');
    expect(html).toContain('inset-inline-end:0px');
    expect(html).toContain('[--table-row-bg:var(--warning-surface)]');
    expect(html).toContain('bg-inherit');
    expect(html.match(/sticky/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('renders the invoice number after the product, and marks a quote that has none', () => {
    const html = renderQuoteTableRows([
      createQuoteTableRow(buildPriorityQuote({ invoiceNumber: 'INV-4821' })),
      createQuoteTableRow(buildPriorityQuote({ invoiceNumber: null })),
    ]);

    const headerPositions = ['>Product<', '>Invoice number<', '>Dates<'].map((header) => html.indexOf(header));

    expect(html).toContain('INV-4821');
    expect(html).toContain('No invoice');
    // A missing header indexes at -1, so assert every header is present before comparing positions.
    expect(headerPositions.every((position) => position >= 0)).toBe(true);
    expect(headerPositions).toEqual([...headerPositions].sort((first, second) => first - second));
  });

  it('renders whether delivery is included in the sale price or charged separately', () => {
    const html = renderQuoteTableRows([
      createQuoteTableRow(buildPriorityQuote({ deliveryIncluded: true, deliveryPrice: 0 })),
      createQuoteTableRow(buildPriorityQuote({ deliveryIncluded: false, deliveryPrice: 1_500 })),
    ]);

    expect(html).toContain('Delivery included');
    expect(html).toContain(`${formatCurrency(1_500, 'ZAR')} delivery`);
  });
});

function toDateOnly(date: Date): string {
  return formatDateFns(date, 'yyyy-MM-dd');
}

function renderQuoteTableRows(rows: QuoteTableRow[]) {
  return renderToStaticMarkup(<TestQuoteTable rows={rows} />);
}

function TestQuoteTable({ rows }: { rows: QuoteTableRow[] }) {
  const table = useDataTable({
    columns: createQuoteTableColumns({
      canOpenJobs: false,
      customerOptions: [],
      productOptions: [],
      salespersonOptions: [],
      showCustomerColumn: true,
    }),
    data: rows,
    initialState: {
      columnPinning: {
        start: quoteTablePinnedStartColumns,
        end: quoteTablePinnedEndColumns,
      },
    },
  });

  return (
    <DataTable
      emptyMessage="No quotes found."
      getRowClassName={getQuoteTableRowClassName}
      hideGlobalFilter
      paginationMode="complete"
      table={table}
      total={rows.length}
    />
  );
}

function buildPriorityQuote(overrides: Partial<Record<keyof PriorityQuoteType, unknown>> = {}): PriorityQuoteType {
  return PriorityQuote.parse({
    code: 'QUO-00001',
    createdAt: '2026-06-01T10:00:00.000Z',
    customerCompanyName: 'Acme Mining',
    customerId: '10000000-0000-4000-8000-000000000000',
    customerThumbnailDataUrl: null,
    deliveryIncluded: true,
    deliveryPrice: 0,
    depositPercent: 50,
    discountPercent: 0,
    documentNotes: null,
    earliestDeliveryDate: '2026-06-20',
    id: '00000000-0000-4000-8000-000000000000',
    job: null,
    kind: 'product',
    notes: null,
    plannedDeliveryDate: '2026-07-10',
    preferredDeliveryDate: '2026-06-20',
    productId: '20000000-0000-4000-8000-000000000000',
    product: {
      buildTimeDays: 10,
      currencyCode: 'ZAR',
      modelCode: 'MDL-1',
      name: 'Loader Bucket',
      thumbnailDataUrl: null,
    },
    quotedBasePrice: 100000,
    quotedCurrencyCode: 'ZAR',
    salesPersonEmail: 'sales@example.com',
    salesPersonId: '30000000-0000-4000-8000-000000000000',
    salesPersonName: 'Sales User',
    salesPersonThumbnailDataUrl: null,
    selectedAssemblies: [],
    status: 'accepted',
    statusChangedAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    validUntil: '2026-08-01T00:00:00.000Z',
    workTitle: null,
    ...overrides,
  });
}
