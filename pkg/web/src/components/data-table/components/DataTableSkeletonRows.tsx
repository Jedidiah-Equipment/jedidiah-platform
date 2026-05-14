import { Skeleton } from '@/components/ui/skeleton.js';
import { TableCell, TableRow } from '@/components/ui/table.js';

type DataTableSkeletonRowsProps = {
  columns: number;
  rows: number;
};

export function DataTableSkeletonRows({ columns, rows }: DataTableSkeletonRowsProps) {
  const rowKeys = createSkeletonKeys('row', rows);
  const columnKeys = createSkeletonKeys('cell', Math.max(columns, 1));

  return rowKeys.map((rowKey) => (
    <TableRow key={rowKey}>
      {columnKeys.map((columnKey) => (
        <TableCell key={`${rowKey}-${columnKey}`}>
          <Skeleton className={columnKey === columnKeys.at(-1) ? 'h-4 w-20' : 'h-4 w-full'} />
        </TableCell>
      ))}
    </TableRow>
  ));
}

function createSkeletonKeys(prefix: string, length: number): string[] {
  return Array.from({ length }, (_value, index) => `${prefix}-${index + 1}`);
}
