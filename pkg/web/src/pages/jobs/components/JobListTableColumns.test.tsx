import { type JobSummary, JobSummary as JobSummarySchema } from '@pkg/schema';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DataTable } from '@/components/data-table/DataTable.js';

import { createJobListColumns } from './JobListTableColumns.js';

describe('Job List table columns', () => {
  it('renders the code, customer, product, serial, and schedule window for a scheduled Job', () => {
    const html = renderJobListRows([
      buildJob({
        code: 42,
        customerCompanyName: 'Acme Mining',
        productModelCode: 'MDL-1',
        productName: 'Loader Bucket',
        productSerialNumber: 'SN-2026-0042',
        scheduleState: { done: 1, active: 1, endDate: '2026-06-20', scheduled: 2, startDate: '2026-06-05', total: 4 },
      }),
    ]);

    expect(html).toContain('JOB-00042');
    expect(html).toContain('Acme Mining');
    expect(html).toContain('Loader Bucket');
    expect(html).toContain('MDL-1');
    expect(html).toContain('SN-2026-0042');
    expect(html).toContain('1 Done');
    expect(html).toContain('1 Active');
    expect(html).toContain('2 Scheduled');
    expect(html).not.toContain('Not scheduled');
    // Start date / End date columns render the projected window.
    expect(html).toContain('Jun 5, 2026');
    expect(html).toContain('Jun 20, 2026');
    // Not every Slot is done, so the Complete column shows no check icon.
    expect(html).not.toContain('tabler-icon-check');
  });

  it('marks a Job complete with a check icon only once every Slot is done', () => {
    const html = renderJobListRows([
      buildJob({
        scheduleState: { done: 3, active: 0, endDate: '2026-06-15', scheduled: 0, startDate: '2026-06-05', total: 3 },
      }),
    ]);

    expect(html).toContain('tabler-icon-check');
  });

  it('falls back to "Standalone" when a Job has no customer', () => {
    const html = renderJobListRows([buildJob({ customerCompanyName: null })]);

    expect(html).toContain('Standalone');
  });

  it('renders the "Not scheduled" badge for a Job with no Work Slots', () => {
    const html = renderJobListRows([
      buildJob({ scheduleState: { done: 0, active: 0, endDate: null, scheduled: 0, startDate: null, total: 0 } }),
    ]);

    expect(html).toContain('Not scheduled');
    expect(html).not.toContain(' Done');
  });

  it('renders custom job work titles without a product serial', () => {
    const html = renderJobListRows([
      buildJob({
        productId: null,
        productModelCode: null,
        productName: null,
        productSerialNumber: null,
        productSerialPrefix: null,
        productSerialSequence: null,
        productSerialYear: null,
        quoteKind: 'custom',
        workTitle: 'Pump skid rebuild',
      }),
    ]);

    expect(html).toContain('Pump skid rebuild');
    expect(html).toContain('Custom work');
    expect(html).not.toContain('SN-2026-0001');
  });
});

function renderJobListRows(rows: JobSummary[]) {
  return renderToStaticMarkup(<TestJobListTable rows={rows} />);
}

function TestJobListTable({ rows }: { rows: JobSummary[] }) {
  const table = useReactTable({
    columns: createJobListColumns({ canEditJobs: false, canOpenJobs: false }),
    data: rows,
    getCoreRowModel: getCoreRowModel(),
  });

  return <DataTable emptyMessage="No jobs found." hideGlobalFilter table={table} total={rows.length} />;
}

function buildJob(overrides: Partial<Record<keyof JobSummary, unknown>> = {}): JobSummary {
  return JobSummarySchema.parse({
    code: 1,
    createdAt: '2026-06-01T10:00:00.000Z',
    customerCompanyName: 'Acme Mining',
    customerId: '10000000-0000-4000-8000-000000000000',
    customerThumbnailDataUrl: null,
    id: '00000000-0000-4000-8000-000000000000',
    productId: '20000000-0000-4000-8000-000000000000',
    productModelCode: 'MDL-1',
    productName: 'Loader Bucket',
    productSerialNumber: 'SN-2026-0001',
    productSerialPrefix: 'SN',
    productSerialSequence: 1,
    productSerialYear: 26,
    productThumbnailDataUrl: null,
    quoteCode: 1,
    quoteKind: 'product',
    quoteId: '30000000-0000-4000-8000-000000000000',
    scheduleState: null,
    updatedAt: '2026-06-01T10:00:00.000Z',
    vinNumber: null,
    description: null,
    workTitle: null,
    ...overrides,
  });
}
