import type {
  Cell,
  CellContext,
  Column,
  ColumnDef,
  Header,
  ReactTable,
  Row,
  RowData,
  TableOptions,
} from '@tanstack/react-table';
import {
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFns,
  globalFilteringFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';

/**
 * The single feature set behind every table in the app.
 *
 * v9 only exposes a table/column/row API when its feature is registered, and `DataTable` takes an
 * already-built table as a prop, so the primitive can only rely on features every caller registered.
 * One shared set keeps that contract concrete and keeps feature code writing `DataTableColumnDef<T>`
 * instead of v9's three-argument generics.
 *
 * The `filterFns`/`sortFns` registries are the full built-in sets on purpose: no column names a
 * built-in by string, but columns left on the default `'auto'` resolve their function out of these
 * registries by name at runtime, and an unregistered name degrades silently — a column filter stops
 * filtering, a sort falls back to `basic` — rather than failing to compile.
 */
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns,
  sortFns,
});

export type DataTableFeatures = typeof dataTableFeatures;

export type { RowData };

export type DataTableColumnDef<TData extends RowData, TValue = unknown> = ColumnDef<DataTableFeatures, TData, TValue>;

export type DataTableInstance<TData extends RowData> = ReactTable<DataTableFeatures, TData>;

export type DataTableCellContext<TData extends RowData, TValue = unknown> = CellContext<
  DataTableFeatures,
  TData,
  TValue
>;

export type DataTableCellInstance<TData extends RowData, TValue = unknown> = Cell<DataTableFeatures, TData, TValue>;

export type DataTableColumnInstance<TData extends RowData, TValue = unknown> = Column<DataTableFeatures, TData, TValue>;

export type DataTableHeaderInstance<TData extends RowData, TValue = unknown> = Header<DataTableFeatures, TData, TValue>;

export type DataTableRowInstance<TData extends RowData> = Row<DataTableFeatures, TData>;

type DataTableOptions<TData extends RowData> = Omit<TableOptions<DataTableFeatures, TData>, 'features'>;

export function useDataTable<TData extends RowData>(options: DataTableOptions<TData>): DataTableInstance<TData> {
  return useTable<DataTableFeatures, TData>({ ...options, features: dataTableFeatures });
}
