import { PriorityQuote, type PriorityQuote as PriorityQuoteType } from '@pkg/schema';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DataTable } from '@/components/data-table/DataTable.js';

import {
  createPriorityQuoteTableRow,
  createQuoteTableColumns,
  createQuoteTableRow,
  getQuoteTableRowClassName,
  type QuoteTableRow,
} from './components/QuoteTableColumns.js';

describe('Quote table priority rows', () => {
  it('renders warning copy, both delivery dates, and emphasizes the earliest date', () => {
    const html = renderQuoteTableRows([
      createPriorityQuoteTableRow(
        buildPriorityQuote({
          code: 'QUO-00001',
          earliestDeliveryDate: '2026-06-20',
          plannedDeliveryDate: '2026-07-10',
          preferredDeliveryDate: '2026-06-20',
        }),
      ),
    ]);

    expect(html).toContain('Needs job');
    expect(html).toContain('No job');
    expect(html).toContain('Preferred');
    expect(html).toContain('Jun 20, 2026');
    expect(html).toContain('Planned');
    expect(html).toContain('Jul 10, 2026');
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

  it('renders status and job as right-pinned columns', () => {
    const html = renderQuoteTableRows([
      createPriorityQuoteTableRow(buildPriorityQuote({ job: null })),
      createQuoteTableRow(buildPriorityQuote({ job: null })),
    ]);

    expect(html).toContain('right:144px');
    expect(html).toContain('right:0px');
    expect(html).toContain('[--table-row-bg:var(--warning-surface)]');
    expect(html).toContain('bg-inherit');
    expect(html.match(/sticky/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});

function renderQuoteTableRows(rows: QuoteTableRow[]) {
  return renderToStaticMarkup(<TestQuoteTable rows={rows} />);
}

function TestQuoteTable({ rows }: { rows: QuoteTableRow[] }) {
  const table = useReactTable({
    columns: createQuoteTableColumns({
      canOpenJobs: false,
      customerOptions: [],
      productOptions: [],
      salespersonOptions: [],
    }),
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    initialState: {
      columnPinning: {
        right: ['status', 'job'],
      },
    },
  });

  return (
    <DataTable
      emptyMessage="No quotes found."
      getRowClassName={getQuoteTableRowClassName}
      hideGlobalFilter
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
    deliveryPrice: 1500,
    depositPercent: 50,
    discountPercent: 0,
    documentNotes: null,
    earliestDeliveryDate: '2026-06-20',
    id: '00000000-0000-4000-8000-000000000000',
    job: null,
    notes: null,
    plannedDeliveryDate: '2026-07-10',
    preferredDeliveryDate: '2026-06-20',
    productBuildTimeDays: 10,
    productCurrencyCode: 'ZAR',
    productId: '20000000-0000-4000-8000-000000000000',
    productModelCode: 'MDL-1',
    productName: 'Loader Bucket',
    quotedBasePrice: 100000,
    quotedCurrencyCode: 'ZAR',
    salesPersonEmail: 'sales@example.com',
    salesPersonId: '30000000-0000-4000-8000-000000000000',
    salesPersonName: 'Sales User',
    salesPersonThumbnailDataUrl: null,
    selectedAssemblies: [],
    status: 'accepted',
    updatedAt: '2026-06-01T10:00:00.000Z',
    validUntil: '2026-08-01T00:00:00.000Z',
    ...overrides,
  });
}
