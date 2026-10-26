import { type ColumnFiltersState, functionalUpdate, type SortingState, type Updater } from '@tanstack/react-table';
import { create, type StateCreator } from 'zustand';
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

const resolveInitialState = (initialState?: Partial<DataTableState>): DataTableState => ({
  ...defaultState,
  ...initialState,
});

const dataTableState =
  (initialState: DataTableState): StateCreator<DataTableStore> =>
  (set) => ({
    ...initialState,
    reset: () => set(initialState),
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
  });

/** A table store that starts from `initialState` every time it is created; nothing survives a reload. */
export function createDataTableStore(initialState?: Partial<DataTableState>) {
  return create<DataTableStore>()(dataTableState(resolveInitialState(initialState)));
}

export function createPersistedDataTableStore({
  initialState,
  persistName,
  persistVersion = 2,
}: CreatePersistedDataTableStoreOptions) {
  const resolvedInitialState = resolveInitialState(initialState);

  return create<DataTableStore>()(
    persist(dataTableState(resolvedInitialState), {
      name: persistName,
      storage: createJSONStorage(() => localStorage),
      migrate: () => resolvedInitialState,
      partialize: (state) => ({
        columnFilters: state.columnFilters,
        globalFilter: state.globalFilter,
        sorting: state.sorting,
      }),
      version: persistVersion,
    }),
  );
}
