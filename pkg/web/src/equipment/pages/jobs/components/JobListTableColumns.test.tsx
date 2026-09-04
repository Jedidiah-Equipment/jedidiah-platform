import type { JobSummary } from '@pkg/schema/equipment';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useDataTable } from '@/components/data-table/features.js';
import { buildJobSummary } from '@/equipment/test/job-fixtures.js';

import { createJobListColumns, jobTablePinnedEndColumns, jobTablePinnedStartColumns } from './JobListTableColumns.js';

const customerOptions = [{ label: 'Acme Mining', value: '10000000-0000-4000-8000-000000000000' }];

describe('Job List table columns', () => {
  it('pins job code to the start and actions to the end', () => {
    const html = renderJobListRows([], { canEditJobs: true, canOpenJobs: true });

    expect(html).toContain('inset-inline-start:0px');
    expect(html).toContain('inset-inline-end:0px');
    expect(html).toContain('width:112px');
    expect(html).toContain('width:88px');
    expect(html).toContain('bg-inherit');
    expect(html.match(/sticky/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('renders the code, customer, product, serial, and schedule window for a scheduled Job', () => {
    const html = renderJobListRows([
      buildJobSummary({
        code: 42,
        customerCompanyName: 'Acme Mining',
        productModelCode: 'MDL-1',
        productName: 'Loader Bucket',
        productUnit: {
          id: '40000000-0000-4000-8000-000000000000',
          productId: '20000000-0000-4000-8000-000000000000',
          productSerialNumber: 'SN-2026-0042',
          vinNumber: null,
        },
        // The queue span opens on a Saturday, but work runs Monday 06-08 through Friday 06-19.
        scheduleState: {
          done: 1,
          active: 1,
          firstWorkDay: '2026-06-08',
          lastWorkDay: '2026-06-19',
          scheduled: 2,
          total: 4,
        },
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
    // Start date / End date columns label the working window, not the raw queue span.
    expect(html).toContain('Jun 8, 2026');
    expect(html).toContain('Jun 19, 2026');
    expect(html).not.toContain('Jun 6, 2026');
    expect(html).not.toContain('Jun 20, 2026');
    // The Job carries no stored completion date, so the Complete column shows no check icon.
    expect(html).not.toContain('tabler-icon-check');
  });

  it('shows the stored completion date, not derived Slot state', () => {
    const html = renderJobListRows([
      buildJobSummary({
        completedOn: '2026-06-14',
        // Every Slot is done, but the column reads `completedOn` — the two agree here only by coincidence.
        scheduleState: {
          done: 3,
          active: 0,
          firstWorkDay: '2026-06-05',
          lastWorkDay: '2026-06-14',
          scheduled: 0,
          total: 3,
        },
      }),
    ]);

    expect(html).toContain('tabler-icon-check');
    expect(html).toContain('Jun 14, 2026');
  });

  it('leaves the Complete column blank for a Job whose Slots are all done but was never stamped', () => {
    const html = renderJobListRows([
      buildJobSummary({
        completedOn: null,
        scheduleState: {
          done: 3,
          active: 0,
          firstWorkDay: '2026-06-05',
          lastWorkDay: '2026-06-14',
          scheduled: 0,
          total: 3,
        },
      }),
    ]);

    expect(html).not.toContain('tabler-icon-check');
  });

  // A Job with no Customer is one on a machine we hold, which is a state worth naming rather than a gap.
  it('reads a Job on a machine we hold as Stock', () => {
    const html = renderJobListRows([buildJobSummary({ customerCompanyName: null, customerId: null })]);

    expect(html).toContain('Stock');
    expect(html).not.toContain('Standalone');
  });

  it('renders the "Not scheduled" badge for a Job with no Work Slots', () => {
    const html = renderJobListRows([
      buildJobSummary({
        scheduleState: {
          done: 0,
          active: 0,
          firstWorkDay: null,
          lastWorkDay: null,
          scheduled: 0,
          total: 0,
        },
      }),
    ]);

    expect(html).toContain('Not scheduled');
    expect(html).not.toContain(' Done');
  });

  it('renders custom job work titles without a product serial', () => {
    const html = renderJobListRows([
      buildJobSummary({
        productModelCode: null,
        productName: null,
        productUnit: null,
        quoteKind: 'custom',
        workTitle: 'Pump skid rebuild',
      }),
    ]);

    expect(html).toContain('Pump skid rebuild');
    expect(html).toContain('Service Work');
    expect(html).not.toContain('SN-2026-0001');
  });

  it('exposes server-backed filters and serial sorting controls', () => {
    const html = renderJobListRows([buildJobSummary()]);

    expect(html).toContain('aria-label="Filter Job"');
    expect(html).toContain('aria-label="Filter Customer"');
    expect(html).toContain('aria-label="Filter Serial"');
    expect(html).toContain('aria-label="Sort Serial"');
    expect(html).not.toContain('aria-label="Sort Customer"');
    expect(html).not.toContain('aria-label="Sort Start date"');
    expect(html).toContain('aria-label="Sort Complete"');
    // Completed Jobs are hidden, so every Complete cell is empty and a date range could only return nothing.
    expect(html).not.toContain('aria-label="Filter Complete"');
  });

  it('offers the Complete date filter once completed Jobs are included', () => {
    const html = renderJobListRows([buildJobSummary()], {
      canEditJobs: false,
      canFilterCompletedOn: true,
      canOpenJobs: false,
    });

    expect(html).toContain('aria-label="Filter Complete"');
  });
});

type TestColumnOptions = { canEditJobs: boolean; canFilterCompletedOn?: boolean; canOpenJobs: boolean };

function renderJobListRows(
  rows: JobSummary[],
  permissions: TestColumnOptions = { canEditJobs: false, canOpenJobs: false },
) {
  return renderToStaticMarkup(<TestJobListTable permissions={permissions} rows={rows} />);
}

function TestJobListTable({ permissions, rows }: { permissions: TestColumnOptions; rows: JobSummary[] }) {
  const table = useDataTable({
    columns: createJobListColumns({
      canFilterCompletedOn: false,
      ...permissions,
      customerOptions,
      showCustomerColumn: true,
    }),
    data: rows,
    state: {
      columnPinning: {
        start: jobTablePinnedStartColumns,
        end: permissions.canOpenJobs ? jobTablePinnedEndColumns : [],
      },
    },
  });

  return (
    <DataTable
      emptyMessage="No jobs found."
      hideGlobalFilter
      paginationMode="complete"
      table={table}
      total={rows.length}
    />
  );
}
