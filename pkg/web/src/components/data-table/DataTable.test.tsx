import { type ColumnDef, type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DataTable } from './DataTable.js';

type TestRow = {
  name: string;
};

const columns: ColumnDef<TestRow>[] = [
  {
    accessorKey: 'name',
    enableColumnFilter: true,
    header: 'Name',
  },
];

describe('DataTable reset filters control', () => {
  it('shows the reset control when global search is active', () => {
    const html = renderTestTable({ globalFilter: 'steel' });

    expect(html).toContain('Reset filters');
  });

  it('shows the reset control for hidden-search tables with active column filters', () => {
    const html = renderTestTable({
      columnFilters: [{ id: 'name', value: 'steel' }],
      hideGlobalFilter: true,
    });

    expect(html).toContain('Reset filters');
  });

  it('hides the reset control when the table is unfiltered', () => {
    const html = renderTestTable();

    expect(html).not.toContain('Reset filters');
  });
});

function renderTestTable({
  columnFilters = [],
  globalFilter = '',
  hideGlobalFilter = false,
}: {
  columnFilters?: ColumnFiltersState;
  globalFilter?: string;
  hideGlobalFilter?: boolean;
} = {}) {
  return renderToStaticMarkup(
    <TestDataTable columnFilters={columnFilters} globalFilter={globalFilter} hideGlobalFilter={hideGlobalFilter} />,
  );
}

function TestDataTable({
  columnFilters,
  globalFilter,
  hideGlobalFilter,
}: {
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  hideGlobalFilter: boolean;
}) {
  const table = useReactTable({
    columns,
    data: [{ name: 'Acme Steel' }],
    getCoreRowModel: getCoreRowModel(),
    onColumnFiltersChange: () => undefined,
    onGlobalFilterChange: () => undefined,
    state: {
      columnFilters,
      globalFilter,
    },
  });

  return <DataTable emptyMessage="No rows found." hideGlobalFilter={hideGlobalFilter} table={table} total={1} />;
}
