import { useDebouncedValue } from "@mantine/hooks";
import { type Column, flexRender, type Header } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, FunnelIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { cn } from "@/lib/utils.js";
import { getColumnLabel } from "./data-table-utils.js";

type DataTableHeaderProps<TData> = {
  debounceMs: number;
  header: Header<TData, unknown>;
};

export function DataTableHeader<TData>({ debounceMs, header }: DataTableHeaderProps<TData>) {
  const content = flexRender(header.column.columnDef.header, header.getContext());

  return (
    <div className={cn("flex items-center gap-0", isRightAligned(header) && "justify-end")}>
      <div className="min-w-0 truncate pr-2">{content}</div>
      {header.column.getCanSort() ? <DataTableSortButton column={header.column} /> : null}
      {header.column.getCanFilter() ? (
        <DataTableFilterButton column={header.column} debounceMs={debounceMs} />
      ) : null}
    </div>
  );
}

type DataTableSortButtonProps<TData> = {
  column: Column<TData, unknown>;
};

function DataTableSortButton<TData>({ column }: DataTableSortButtonProps<TData>) {
  const sorted = column.getIsSorted();
  const Icon = sorted === false ? ArrowUpDownIcon : sorted === "asc" ? ArrowUpIcon : ArrowDownIcon;
  const label = getColumnLabel(column);

  return (
    <Button
      aria-label={`Sort ${label}`}
      className={cn("w-5", sorted !== false && "text-primary hover:text-primary")}
      onClick={() => column.toggleSorting(sorted === "asc")}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      <Icon />
    </Button>
  );
}

type DataTableFilterButtonProps<TData> = {
  column: Column<TData, unknown>;
  debounceMs: number;
};

function DataTableFilterButton<TData>({ column, debounceMs }: DataTableFilterButtonProps<TData>) {
  const label = getColumnLabel(column);
  const filterValue = String(column.getFilterValue() ?? "");
  const [filterDraft, setFilterDraft] = useState(filterValue);
  const [debouncedFilter] = useDebouncedValue(filterDraft, debounceMs);

  useEffect(() => {
    setFilterDraft(filterValue);
  }, [filterValue]);

  useEffect(() => {
    if (debouncedFilter === filterDraft && debouncedFilter !== filterValue) {
      column.setFilterValue(debouncedFilter ? debouncedFilter : undefined);
    }
  }, [column, debouncedFilter, filterDraft, filterValue]);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={`Filter ${label}`}
            className={cn("w-5", filterValue && "text-primary hover:text-primary")}
            size="icon-xs"
            type="button"
            variant="ghost"
          />
        }
      >
        <FunnelIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">Filter {label}</div>
          <div className="flex items-center gap-2">
            <Input
              className="h-7 px-2 text-sm"
              onChange={(event) => setFilterDraft(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder={`Filter ${label.toLowerCase()}...`}
              value={filterDraft}
            />
            <Button
              aria-label={`Clear ${label} filter`}
              disabled={!filterDraft}
              onClick={() => {
                setFilterDraft("");
                column.setFilterValue(undefined);
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function isRightAligned<TData>(header: Header<TData, unknown>): boolean {
  return header.column.columnDef.meta?.headerClassName?.includes("text-right") ?? false;
}
