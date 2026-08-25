import type { RowData } from '@tanstack/react-table';
import type { DataTableCellInstance, DataTableColumnInstance } from './features.js';

export function getCellClassName<TData extends RowData>(cell: DataTableCellInstance<TData>): string | undefined {
  return cell.column.columnDef.meta?.cellClassName;
}

export function getColumnLabel<TData extends RowData>(column: DataTableColumnInstance<TData>): string {
  return typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;
}

export function hasActiveFilterValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'string') {
    return value.length > 0;
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => typeof item === 'string' && item.length > 0);
  }

  return false;
}
