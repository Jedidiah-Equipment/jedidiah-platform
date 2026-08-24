// @vitest-environment jsdom

import {
  type CellContext,
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { act, memo, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

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
const MemoizedCell = memo(({ row }: CellContext<TestRow, unknown>) => <output>{row.original.name}</output>);

const mountedRoots: Array<ReturnType<typeof createRoot>> = [];
const mountedContainers: HTMLDivElement[] = [];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of mountedRoots) {
    act(() => root.unmount());
  }
  mountedRoots.length = 0;
  for (const container of mountedContainers) {
    container.remove();
  }
  mountedContainers.length = 0;
});

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

describe('DataTable interactive cells', () => {
  it('keeps a focused input mounted and supports memoized cells when column data refreshes', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    mountedContainers.push(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
      root.render(<EditableTestDataTable optionLabel="Loading" />);
    });

    const input = container.querySelector('input');
    expect(input).not.toBeNull();
    act(() => input?.focus());

    await act(async () => {
      root.render(<EditableTestDataTable optionLabel="Loaded" />);
    });

    expect(container.querySelector('input')).toBe(input);
    expect(input?.dataset.optionLabel).toBe('Loaded');
    expect(document.activeElement).toBe(input);
    expect(container.querySelector('output')?.textContent).toBe('Loaded');
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

  return (
    <DataTable
      emptyMessage="No rows found."
      hideGlobalFilter={hideGlobalFilter}
      paginationMode="complete"
      table={table}
      total={1}
    />
  );
}

function EditableTestDataTable({ optionLabel }: { optionLabel: string }) {
  const editableColumns = useMemo<ColumnDef<TestRow>[]>(
    () => [
      {
        cell: () => <input aria-label="Quantity" data-option-label={optionLabel} defaultValue="5" />,
        header: 'Quantity',
        id: 'quantity',
      },
      {
        cell: MemoizedCell,
        header: 'Memoized',
        id: 'memoized',
      },
    ],
    [optionLabel],
  );
  const table = useReactTable({
    columns: editableColumns,
    data: useMemo(() => [{ name: optionLabel }], [optionLabel]),
    getCoreRowModel: getCoreRowModel(),
  });

  return <DataTable emptyMessage="No rows found." hideGlobalFilter paginationMode="complete" table={table} total={1} />;
}
