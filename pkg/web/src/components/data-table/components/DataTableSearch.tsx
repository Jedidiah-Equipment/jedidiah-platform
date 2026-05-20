import { useDebouncedValue } from '@mantine/hooks';
import type { Table } from '@tanstack/react-table';
import { SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input.js';

type DataTableSearchProps<TData> = {
  debounceMs: number;
  placeholder: string;
  rightSection?: React.ReactNode;
  table: Table<TData>;
};

export function DataTableSearch<TData>({ debounceMs, placeholder, rightSection, table }: DataTableSearchProps<TData>) {
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative sm:max-w-xs">
        <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
        <Input
          className="pl-8"
          onChange={(event) => setGlobalFilterDraft(event.target.value)}
          placeholder={placeholder}
          value={globalFilterDraft}
        />
      </div>
      {rightSection}
    </div>
  );
}
