import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type DataTableColumnDef, useDataTable } from './features.js';

type TestRow = {
  name: string;
};

const columns: DataTableColumnDef<TestRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
];

// 'item10' sorts before 'item2' under the basic comparator and after it under alphanumeric, so the
// rendered order tells the two apart. A column that names no sort or filter function resolves one by
// name out of the registries in `dataTableFeatures`; drop a registry and the resolution degrades to
// basic (or to no filtering at all) at runtime without failing to compile.
const rows: TestRow[] = [{ name: 'item2' }, { name: 'item10' }, { name: 'item1' }];

type TestTableState = {
  columnFilters?: ColumnFiltersState;
  sorting?: SortingState;
};

describe('dataTableFeatures', () => {
  it('sorts an unannotated column with the alphanumeric function rather than the basic fallback', () => {
    expect(renderRowNames({ sorting: [{ id: 'name', desc: false }] })).toEqual(['item1', 'item2', 'item10']);
  });

  it('filters an unannotated column by substring', () => {
    expect(renderRowNames({ columnFilters: [{ id: 'name', value: 'm1' }] })).toEqual(['item10', 'item1']);
  });
});

function renderRowNames(state: TestTableState): string[] {
  const html = renderToStaticMarkup(<TestTable state={state} />);

  return [...html.matchAll(/<li>([^<]*)<\/li>/g)].map(([, name]) => name ?? '');
}

function TestTable({ state }: { state: TestTableState }) {
  const table = useDataTable({
    columns,
    data: rows,
    state: {
      columnFilters: state.columnFilters ?? [],
      sorting: state.sorting ?? [],
    },
  });

  return (
    <ul>
      {table.getRowModel().rows.map((row) => (
        <li key={row.id}>{row.original.name}</li>
      ))}
    </ul>
  );
}
