import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import type { Table } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input.js';

type DataTableSearchProps<TData> = {
  debounceMs: number;
  placeholder: string;
  rightSection?: React.ReactNode;
  showSearch?: boolean;
  table: Table<TData>;
};

export function DataTableSearch<TData>({
  debounceMs,
  placeholder,
  rightSection,
  showSearch = true,
  table,
}: DataTableSearchProps<TData>) {
  const globalFilter = String(table.getState().globalFilter ?? '');
  const [globalFilterDraft, setGlobalFilterDraft] = useState(globalFilter);
  const [debouncedGlobalFilter] = useDebouncedValue(globalFilterDraft, debounceMs);

  useEffect(() => {
    setGlobalFilterDraft(globalFilter);
  }, [globalFilter]);

  useEffect(() => {
    if (debouncedGlobalFilter === globalFilterDraft && debouncedGlobalFilter !== globalFilter) {
      table.setGlobalFilter(debouncedGlobalFilter);
    }
  }, [debouncedGlobalFilter, globalFilter, globalFilterDraft, table]);

  return (
    <div className="flex min-h-10 flex-col gap-3 border-b bg-muted/20 px-2 py-2 sm:flex-row sm:items-center sm:justify-between">
      {showSearch ? (
        <div className="relative min-w-0 flex-1 text-xs">
          <IconSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-0 size-4 text-muted-foreground" />
          <Input
            className="h-6 translate-y-px border-0 bg-transparent! pr-0 pl-6 shadow-none focus-visible:border-0 focus-visible:ring-0"
            onChange={(event) => setGlobalFilterDraft(event.target.value)}
            placeholder={placeholder}
            value={globalFilterDraft}
          />
        </div>
      ) : null}
      {rightSection ? <div className="flex items-center justify-end gap-2 sm:ml-auto">{rightSection}</div> : null}
    </div>
  );
}
