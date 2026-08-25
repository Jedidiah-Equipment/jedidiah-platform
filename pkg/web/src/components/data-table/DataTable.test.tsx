// @vitest-environment jsdom

import type { ColumnFiltersState } from '@tanstack/react-table';
import { act, memo, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { DataTable } from './DataTable.js';
import { type DataTableCellContext, type DataTableColumnDef, useDataTable } from './features.js';

type TestRow = {
  name: string;
};

const columns: DataTableColumnDef<TestRow>[] = [
  {
    accessorKey: 'name',
    enableColumnFilter: true,
    header: 'Name',
  },
];
const MemoizedCell = memo(({ row }: DataTableCellContext<TestRow>) => <output>{row.original.name}</output>);

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

// The v9 feature set is what makes these controls work at all: sorting, global search, row selection
// and the windowed row model each come from a feature registered in `dataTableFeatures`, and dropping
// one leaves the control rendered but inert rather than failing to compile.
describe('DataTable live controls', () => {
  const windowRows = Array.from({ length: 30 }, (_, index) => ({ name: `row${index + 1}` }));

  it('reorders rows when the header sort control is used', async () => {
    const { container, click } = await mountTable({ data: [{ name: 'item2' }, { name: 'item10' }, { name: 'item1' }] });

    await click(`[aria-label="Sort Name"]`);
    expect(readRowNames(container)).toEqual(['item1', 'item2', 'item10']);

    await click(`[aria-label="Sort Name"]`);
    expect(readRowNames(container)).toEqual(['item10', 'item2', 'item1']);
  });

  it('narrows rows as the global search is typed', async () => {
    const { container, type } = await mountTable({
      data: [{ name: 'item2' }, { name: 'item10' }, { name: 'item1' }],
    });

    await type('input[placeholder="Search..."]', 'item1');
    expect(readRowNames(container)).toEqual(['item10', 'item1']);
  });

  it('paints one window of rows and grows it on Load more', async () => {
    const { container, clickText } = await mountTable({
      data: windowRows,
      paginationMode: 'incremental',
      pageSize: 10,
    });

    expect(readRowNames(container)).toHaveLength(10);

    await clickText('Load more');
    expect(readRowNames(container)).toHaveLength(20);
  });

  it('selects a row through the selection column', async () => {
    const { container, click } = await mountTable({
      data: [{ name: 'item1' }, { name: 'item2' }],
      withSelection: true,
    });

    await click('[aria-label="Select item1"]');
    expect(container.querySelector('[aria-label="Select item1"]')?.getAttribute('data-checked')).toBe('true');
    expect(container.querySelector('[aria-label="Select item2"]')?.getAttribute('data-checked')).toBeNull();
  });
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

async function mountTable({
  data,
  paginationMode = 'complete',
  pageSize,
  withSelection = false,
}: {
  data: TestRow[];
  paginationMode?: 'complete' | 'incremental';
  pageSize?: number;
  withSelection?: boolean;
}) {
  const container = document.createElement('div');
  document.body.append(container);
  mountedContainers.push(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(
      <LiveTestDataTable
        data={data}
        pageSize={pageSize}
        paginationMode={paginationMode}
        withSelection={withSelection}
      />,
    );
  });

  const find = (selector: string) => {
    const element = container.querySelector(selector);

    if (!element) {
      throw new Error(`No element for ${selector}`);
    }

    return element as HTMLElement;
  };

  return {
    container,
    click: async (selector: string) => {
      const element = find(selector);
      await act(async () => {
        element.click();
      });
    },
    clickText: async (text: string) => {
      const element = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes(text));

      if (!element) {
        throw new Error(`No button labelled ${text}`);
      }

      await act(async () => {
        element.click();
      });
    },
    type: async (selector: string, value: string) => {
      const input = find(selector) as HTMLInputElement;
      await act(async () => {
        setInputValue(input, value);
      });
      // The search box debounces before it writes the table's global filter.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
    },
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function readRowNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll('tbody tr')]
    .map((row) => row.querySelector('td:last-child')?.textContent ?? '')
    .filter((name) => name.length > 0);
}

function LiveTestDataTable({
  data,
  pageSize,
  paginationMode,
  withSelection,
}: {
  data: TestRow[];
  pageSize: number | undefined;
  paginationMode: 'complete' | 'incremental';
  withSelection: boolean;
}) {
  const liveColumns = useMemo<DataTableColumnDef<TestRow>[]>(
    () =>
      withSelection
        ? [
            {
              cell: ({ row }) => (
                <input
                  aria-label={`Select ${row.original.name}`}
                  checked={row.getIsSelected()}
                  data-checked={row.getIsSelected() ? 'true' : undefined}
                  onChange={(event) => row.toggleSelected(event.target.checked)}
                  type="checkbox"
                />
              ),
              header: 'Select',
              id: 'select',
            },
            ...columns,
          ]
        : columns,
    [withSelection],
  );
  const table = useDataTable({ columns: liveColumns, data, enableRowSelection: true });

  return (
    <DataTable
      emptyMessage="No rows found."
      filterDebounceMs={0}
      {...(paginationMode === 'incremental'
        ? { paginationMode: 'incremental' as const, ...(pageSize === undefined ? {} : { pageSize }) }
        : { paginationMode: 'complete' as const })}
      table={table}
      total={data.length}
    />
  );
}

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
  const table = useDataTable({
    columns,
    data: [{ name: 'Acme Steel' }],
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
  const editableColumns = useMemo<DataTableColumnDef<TestRow>[]>(
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
  const table = useDataTable({
    columns: editableColumns,
    data: useMemo(() => [{ name: optionLabel }], [optionLabel]),
  });

  return <DataTable emptyMessage="No rows found." hideGlobalFilter paginationMode="complete" table={table} total={1} />;
}
