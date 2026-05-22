import {
  type ColumnFiltersState,
  functionalUpdate,
  type PaginationState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type DataTableState = {
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  pagination: PaginationState;
  sorting: SortingState;
};

export type DataTableStore = DataTableState & {
  reset: () => void;
  setColumnFilters: (updater: Updater<ColumnFiltersState>) => void;
  setGlobalFilter: (updater: Updater<string>) => void;
  setPageIndex: (pageIndex: number) => void;
  setPagination: (updater: Updater<PaginationState>) => void;
  setSorting: (updater: Updater<SortingState>) => void;
};

type CreatePersistedDataTableStoreOptions = {
  initialState?: Partial<DataTableState>;
  persistName: string;
  persistVersion?: number;
};

const defaultState: DataTableState = {
  columnFilters: [],
  globalFilter: '',
  pagination: {
    pageIndex: 0,
    pageSize: 10,
  },
  sorting: [],
};

export function createPersistedDataTableStore({
  initialState,
  persistName,
  persistVersion = 1,
}: CreatePersistedDataTableStoreOptions) {
  const resolvedInitialState: DataTableState = {
    ...defaultState,
    ...initialState,
    pagination: {
      ...defaultState.pagination,
      ...initialState?.pagination,
    },
  };

  return create<DataTableStore>()(
    persist(
      (set) => ({
        ...resolvedInitialState,
        reset: () => set(resolvedInitialState),
        setColumnFilters: (updater) =>
          set((state) => ({
            columnFilters: functionalUpdate(updater, state.columnFilters),
            pagination: resetPaginationPageIndex(state.pagination),
          })),
        setGlobalFilter: (updater) =>
          set((state) => ({
            globalFilter: String(functionalUpdate(updater, state.globalFilter)),
            pagination: resetPaginationPageIndex(state.pagination),
          })),
        setPageIndex: (pageIndex) =>
          set((state) => ({
            pagination: {
              ...state.pagination,
              pageIndex,
            },
          })),
        setPagination: (updater) =>
          set((state) => ({
            pagination: functionalUpdate(updater, state.pagination),
          })),
        setSorting: (updater) =>
          set((state) => ({
            pagination: resetPaginationPageIndex(state.pagination),
            sorting: functionalUpdate(updater, state.sorting),
          })),
      }),
      {
        name: persistName,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          columnFilters: state.columnFilters,
          globalFilter: state.globalFilter,
          pagination: state.pagination,
          sorting: state.sorting,
        }),
        version: persistVersion,
      },
    ),
  );
}

function resetPaginationPageIndex(pagination: PaginationState): PaginationState {
  return {
    ...pagination,
    pageIndex: 0,
  };
}
