import { useDebouncedValue } from '@mantine/hooks';
import { IconFilterOff, IconSearch } from '@tabler/icons-react';
import type { Table } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';

type DataTableSearchProps<TData> = {
  debounceMs: number;
  placeholder: string;
  rightSection?: React.ReactNode;
  showResetFilters?: boolean;
  showSearch?: boolean;
  table: Table<TData>;
};

export function DataTableSearch<TData>({
  debounceMs,
  placeholder,
  rightSection,
  showResetFilters = false,
  showSearch = true,
  table,
}: DataTableSearchProps<TData>) {
  const globalFilter = String(table.getState().globalFilter ?? '');
  const [globalFilterDraft, setGlobalFilterDraft] = useState(globalFilter);
  const [debouncedGlobalFilter] = useDebouncedValue(globalFilterDraft, debounceMs);
  const showResetButton = showResetFilters || (showSearch && globalFilterDraft.length > 0);
  const showRightSection = showResetButton || rightSection;

  useEffect(() => {
    setGlobalFilterDraft(globalFilter);
  }, [globalFilter]);

  useEffect(() => {
    if (debouncedGlobalFilter === globalFilterDraft && debouncedGlobalFilter !== globalFilter) {
      table.setGlobalFilter(debouncedGlobalFilter);
    }
  }, [debouncedGlobalFilter, globalFilter, globalFilterDraft, table]);

  const handleResetFilters = () => {
    setGlobalFilterDraft('');
    table.setGlobalFilter('');
    table.setColumnFilters([]);
  };

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
      {showRightSection ? (
        <div className="flex items-center justify-end gap-2 sm:ml-auto">
          {showResetButton ? (
            <Button
              className="border-primary/50 text-primary hover:border-primary hover:bg-primary/10 hover:text-primary"
              onClick={handleResetFilters}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconFilterOff data-icon="inline-start" />
              Reset filters
            </Button>
          ) : null}
          {rightSection}
        </div>
      ) : null}
    </div>
  );
}
