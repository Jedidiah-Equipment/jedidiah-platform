import { type JobSummary, JobSummary as JobSummarySchema } from '@pkg/schema';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DataTable } from '@/components/data-table/DataTable.js';

import { createJobListColumns } from './JobListTableColumns.js';

describe('Job List table columns', () => {
  it('renders the code, customer, product, and serial for a scheduled Job', () => {
    const html = renderJobListRows([
      buildJob({
        code: 42,
        customerCompanyName: 'Acme Mining',
        productModelCode: 'MDL-1',
        productName: 'Loader Bucket',
        productSerialNumber: 'SN-2026-0042',
        scheduleState: { done: 1, active: 1, scheduled: 2, total: 4 },
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
  });

  it('falls back to "Standalone" when a Job has no customer', () => {
    const html = renderJobListRows([buildJob({ customerCompanyName: null })]);

    expect(html).toContain('Standalone');
  });

  it('renders the "Not scheduled" badge for a Job with no Work Slots', () => {
    const html = renderJobListRows([buildJob({ scheduleState: { done: 0, active: 0, scheduled: 0, total: 0 } })]);

    expect(html).toContain('Not scheduled');
    expect(html).not.toContain(' Done');
  });
});

function renderJobListRows(rows: JobSummary[]) {
  return renderToStaticMarkup(<TestJobListTable rows={rows} />);
}

function TestJobListTable({ rows }: { rows: JobSummary[] }) {
  const table = useReactTable({
    columns: createJobListColumns({ canOpenJobs: false }),
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
    quoteId: '30000000-0000-4000-8000-000000000000',
    scheduleState: null,
    updatedAt: '2026-06-01T10:00:00.000Z',
    vinNumber: null,
    ...overrides,
  });
}
