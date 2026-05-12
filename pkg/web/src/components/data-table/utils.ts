import type { Cell, Column } from "@tanstack/react-table";

export function getCellClassName<TData>(cell: Cell<TData, unknown>): string | undefined {
  return cell.column.columnDef.meta?.cellClassName;
}

export function getColumnLabel<TData>(column: Column<TData, unknown>): string {
  return typeof column.columnDef.header === "string" ? column.columnDef.header : column.id;
}
