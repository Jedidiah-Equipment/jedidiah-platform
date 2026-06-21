import type { Cell, Column } from '@tanstack/react-table';

export function getCellClassName<TData>(cell: Cell<TData, unknown>): string | undefined {
  return cell.column.columnDef.meta?.cellClassName;
}

export function getColumnLabel<TData>(column: Column<TData, unknown>): string {
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
