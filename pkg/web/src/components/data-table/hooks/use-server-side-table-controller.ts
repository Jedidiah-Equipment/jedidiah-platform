import type { ColumnFiltersState } from '@tanstack/react-table';
import { useMemo } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import type { DataTableStore } from '../store.js';
import { getPrimarySort, type SortId, type SortOptions } from '../table-state.js';

export type ServerSideTableListInputBase<TSortBy extends string> = {
  page: number;
  pageSize: number;
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
  const {
    columnFilters,
    globalFilter,
    pagination,
    setColumnFilters,
    setGlobalFilter,
    setPageIndex,
    setPagination,
    setSorting,
    sorting,
  } = store(
    useShallow((state) => ({
      columnFilters: state.columnFilters,
      globalFilter: state.globalFilter,
      pagination: state.pagination,
      setColumnFilters: state.setColumnFilters,
      setGlobalFilter: state.setGlobalFilter,
      setPageIndex: state.setPageIndex,
      setPagination: state.setPagination,
      setSorting: state.setSorting,
      sorting: state.sorting,
    })),
  );
  const sort = getPrimarySort(sorting, sortOptions);
  const listInput = useMemo(
    () =>
      createServerSideTableListInput(
        {
          page: pagination.pageIndex + 1,
          pageSize: pagination.pageSize,
          search: globalFilter,
          sortBy: sort.id,
          sortDirection: sort.desc ? 'desc' : 'asc',
        } satisfies ServerSideTableListInputBase<SortId<TSortSource>>,
        getListInputExtras(columnFilters),
      ),
    [columnFilters, getListInputExtras, globalFilter, pagination.pageIndex, pagination.pageSize, sort.desc, sort.id],
  );

  return {
    columnFilters,
    globalFilter,
    listInput,
    pagination,
    setPageIndex,
    setColumnFilters,
    setGlobalFilter,
    setPagination,
    setSorting,
    sorting,
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
