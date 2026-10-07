import type { DataTableColumnDef } from '@/components/data-table/features.js';

export const historyKindLabels = { reading: 'Readings', breakdown: 'Breakdowns', service: 'Services' } as const;

export function historyKindColumn<T extends { kindLabel: string }>({
  isMachine,
  readsBreakdowns,
  readsServices,
}: {
  isMachine: boolean;
  readsBreakdowns: boolean;
  readsServices: boolean;
}): DataTableColumnDef<T> {
  const labels = [
    historyKindLabels.reading,
    ...(readsBreakdowns ? [historyKindLabels.breakdown] : []),
    ...(readsServices ? [historyKindLabels.service] : []),
  ];
  return {
    accessorKey: 'kindLabel',
    header: 'Kind',
    enableColumnFilter: isMachine,
    // A saved Kind can outlive its subject or permission. Unavailable choices must not hide history.
    filterFn: (row, columnId, value) => !isMachine || !labels.includes(value) || row.getValue(columnId) === value,
    meta: {
      filterVariant: 'select',
      filterOptions: labels.map((label) => ({ label, value: label })),
    },
  };
}
