import { type ColumnFiltersState, functionalUpdate, type SortingState, type Updater } from '@tanstack/react-table';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type DataTableState = {
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  sorting: SortingState;
};

export type DataTableStore = DataTableState & {
  reset: () => void;
  setColumnFilters: (updater: Updater<ColumnFiltersState>) => void;
  setGlobalFilter: (updater: Updater<string>) => void;
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
  sorting: [],
};

export function createPersistedDataTableStore({
  initialState,
  persistName,
  persistVersion = 2,
}: CreatePersistedDataTableStoreOptions) {
  const resolvedInitialState: DataTableState = {
    ...defaultState,
    ...initialState,
  };

  return create<DataTableStore>()(
    persist(
      (set) => ({
        ...resolvedInitialState,
        reset: () => set(resolvedInitialState),
        setColumnFilters: (updater) =>
          set((state) => ({
            columnFilters: functionalUpdate(updater, state.columnFilters),
          })),
        setGlobalFilter: (updater) =>
          set((state) => ({
            globalFilter: String(functionalUpdate(updater, state.globalFilter)),
          })),
        setSorting: (updater) =>
          set((state) => ({
            sorting: functionalUpdate(updater, state.sorting),
          })),
      }),
      {
        name: persistName,
        storage: createJSONStorage(() => localStorage),
        migrate: () => resolvedInitialState,
        partialize: (state) => ({
          columnFilters: state.columnFilters,
          globalFilter: state.globalFilter,
          sorting: state.sorting,
        }),
        version: persistVersion,
      },
    ),
  );
}
