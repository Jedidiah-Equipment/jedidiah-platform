import type { ColumnFiltersState } from '@tanstack/react-table';
import { useMemo } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { WEB_LIST_BATCH_SIZE } from '../constants.js';
import type { DataTableStore } from '../store.js';
import { constrainSorting, getPrimarySort, type SortId, type SortOptions } from '../table-state.js';

export type ServerSideTableListInputBase<TSortBy extends string> = {
  limit: number;
  search: string;
  sortBy: TSortBy;
  sortDirection: 'asc' | 'desc';
};

type DataTableStoreHook = UseBoundStore<StoreApi<DataTableStore>>;

type ListInputExtras = Record<string, unknown>;

type UseServerSideTableControllerOptions<
  TSortSource extends string | { sortBy: string },
  TExtras extends ListInputExtras = Record<string, never>,
> = {
  getListInputExtras: (columnFilters: ColumnFiltersState) => TExtras;
  store: DataTableStoreHook;
  sortOptions: SortOptions<TSortSource>;
};

export function useServerSideTableController<
  TSortSource extends string | { sortBy: string },
  TExtras extends ListInputExtras = Record<string, never>,
>({ getListInputExtras, store, sortOptions }: UseServerSideTableControllerOptions<TSortSource, TExtras>) {
  const { columnFilters, globalFilter, setColumnFilters, setGlobalFilter, setSorting, sorting } = store(
    useShallow((state) => ({
      columnFilters: state.columnFilters,
      globalFilter: state.globalFilter,
      setColumnFilters: state.setColumnFilters,
      setGlobalFilter: state.setGlobalFilter,
      setSorting: state.setSorting,
      sorting: state.sorting,
    })),
  );
  const sort = getPrimarySort(sorting, sortOptions);
  const constrainedSorting = useMemo(() => constrainSorting(sorting, sortOptions), [sortOptions, sorting]);
  const listInput = useMemo(
    () =>
      createServerSideTableListInput(
        {
          limit: WEB_LIST_BATCH_SIZE,
          search: globalFilter,
          sortBy: sort.id,
          sortDirection: sort.desc ? 'desc' : 'asc',
        } satisfies ServerSideTableListInputBase<SortId<TSortSource>>,
        getListInputExtras(columnFilters),
      ),
    [columnFilters, getListInputExtras, globalFilter, sort.desc, sort.id],
  );

  return {
    columnFilters,
    globalFilter,
    listInput,
    setColumnFilters,
    setGlobalFilter,
    setSorting,
    sorting: constrainedSorting,
  };
}

function createServerSideTableListInput<TSortBy extends string, TExtras extends ListInputExtras>(
  base: ServerSideTableListInputBase<TSortBy>,
  extras: TExtras,
) {
  return {
    ...base,
    ...extras,
  } satisfies ServerSideTableListInputBase<TSortBy> & TExtras;
}
