import { useDebouncedValue } from '@mantine/hooks';
import { formatDate } from '@pkg/domain';
import {
  IconArrowDown,
  IconArrowsSort,
  IconArrowUp,
  IconCalendar,
  IconFilter,
  IconX,
} from '@tabler/icons-react';
import { type Column, flexRender, type Header } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button.js';
import { Calendar } from '@/components/ui/calendar.js';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from '@/components/ui/combobox.js';
import { Input } from '@/components/ui/input.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { cn } from '@/lib/utils.js';
import { getColumnLabel } from '../utils.js';

type DataTableHeaderProps<TData> = {
  debounceMs: number;
  header: Header<TData, unknown>;
};

export function DataTableHeader<TData>({ debounceMs, header }: DataTableHeaderProps<TData>) {
  const content = flexRender(header.column.columnDef.header, header.getContext());

  return (
    <div className={cn('flex items-center gap-0', isRightAligned(header) && 'justify-end')}>
      <div className="min-w-0 truncate pr-2">{content}</div>
      {header.column.getCanSort() ? <DataTableSortButton column={header.column} /> : null}
      {header.column.getCanFilter() ? <DataTableFilterButton column={header.column} debounceMs={debounceMs} /> : null}
    </div>
  );
}

type DataTableSortButtonProps<TData> = {
  column: Column<TData, unknown>;
};

function DataTableSortButton<TData>({ column }: DataTableSortButtonProps<TData>) {
  const sorted = column.getIsSorted();
  const Icon = sorted === false ? IconArrowsSort : sorted === 'asc' ? IconArrowUp : IconArrowDown;
  const label = getColumnLabel(column);

  return (
    <Button
      aria-label={`Sort ${label}`}
      className={cn('w-5', sorted !== false && 'text-primary hover:text-primary')}
      onClick={() => column.toggleSorting(sorted === 'asc')}
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
  const filterValue = column.getFilterValue();
  const hasFilterValue = hasActiveFilterValue(filterValue);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={`Filter ${label}`}
            className={cn('w-5', hasFilterValue && 'text-primary hover:text-primary')}
            size="icon-xs"
            type="button"
            variant="ghost"
          />
        }
      >
        <IconFilter />
      </PopoverTrigger>
      <PopoverContent align="end" className={getFilterPopoverClassName(column)}>
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">Filter {label}</div>
          <DataTableFilterControl column={column} debounceMs={debounceMs} label={label} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

type DataTableFilterControlProps<TData> = {
  column: Column<TData, unknown>;
  debounceMs: number;
  label: string;
};

function DataTableFilterControl<TData>({ column, debounceMs, label }: DataTableFilterControlProps<TData>) {
  const variant = column.columnDef.meta?.filterVariant ?? 'text';

  if (variant === 'select') {
    return <DataTableSelectFilter column={column} label={label} />;
  }

  if (variant === 'multi-select') {
    return <DataTableMultiSelectFilter column={column} label={label} />;
  }

  if (variant === 'date-range') {
    return <DataTableDateRangeFilter column={column} label={label} />;
  }

  return <DataTableTextFilter column={column} debounceMs={debounceMs} label={label} />;
}

function getFilterPopoverClassName<TData>(column: Column<TData, unknown>): string {
  if (column.columnDef.meta?.filterVariant === 'multi-select') {
    return 'w-80 p-2';
  }

  if (column.columnDef.meta?.filterVariant === 'date-range') {
    return 'w-64 p-2';
  }

  return 'w-56 p-2';
}

function DataTableTextFilter<TData>({ column, debounceMs, label }: DataTableFilterControlProps<TData>) {
  const filterValue = String(column.getFilterValue() ?? '');
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
    <div className="flex items-center gap-2">
      <Input
        className="h-7 px-2 text-sm"
        onChange={(event) => setFilterDraft(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        placeholder={`Filter ${label.toLowerCase()}...`}
        value={filterDraft}
      />
      <ClearFilterButton
        disabled={!filterDraft}
        label={label}
        onClear={() => {
          setFilterDraft('');
          column.setFilterValue(undefined);
        }}
      />
    </div>
  );
}

function DataTableSelectFilter<TData>({ column, label }: Pick<DataTableFilterControlProps<TData>, 'column' | 'label'>) {
  const options = column.columnDef.meta?.filterOptions ?? [];
  const filterValue = typeof column.getFilterValue() === 'string' ? column.getFilterValue() : '';
  const selectedOption = options.find((option) => option.value === filterValue);

  return (
    <div className="flex items-center gap-2">
      <Select onValueChange={(value) => column.setFilterValue(value || undefined)} value={filterValue}>
        <SelectTrigger aria-label={`Filter ${label}`} className="h-7 min-w-0 flex-1" size="sm">
          <SelectValue placeholder="All">{selectedOption?.label ?? null}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <ClearFilterButton disabled={!filterValue} label={label} onClear={() => column.setFilterValue(undefined)} />
    </div>
  );
}

function DataTableMultiSelectFilter<TData>({
  column,
  label,
}: Pick<DataTableFilterControlProps<TData>, 'column' | 'label'>) {
  const options = column.columnDef.meta?.filterOptions ?? [];
  const selectedValues = getStringArrayFilterValue(column.getFilterValue());
  const optionLabels = new Map(options.map((option) => [option.value, option.label]));

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <Combobox
          items={options.map((option) => option.value)}
          itemToStringValue={(value) => optionLabels.get(value) ?? value}
          multiple
          onValueChange={(nextValues) => column.setFilterValue(nextValues.length > 0 ? nextValues : undefined)}
          value={selectedValues}
        >
          <ComboboxChips>
            <ComboboxValue>
              {selectedValues.map((value) => (
                <ComboboxChip key={value}>{optionLabels.get(value) ?? value}</ComboboxChip>
              ))}
            </ComboboxValue>
            <ComboboxChipsInput placeholder="Select..." />
          </ComboboxChips>
          <ComboboxContent align="end">
            <ComboboxEmpty>No options found.</ComboboxEmpty>
            <ComboboxList>
              {(value) => (
                <ComboboxItem key={value} value={value}>
                  {optionLabels.get(value) ?? value}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      <ClearFilterButton
        disabled={selectedValues.length === 0}
        label={label}
        onClear={() => column.setFilterValue(undefined)}
      />
    </div>
  );
}

function DataTableDateRangeFilter<TData>({
  column,
  label,
}: Pick<DataTableFilterControlProps<TData>, 'column' | 'label'>) {
  const filterValue = getDateRangeFilterValue(column.getFilterValue());
  const selectedRange = getSelectedDateRange(filterValue);

  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger
          render={
            <Button
              className="h-8 min-w-0 flex-1 justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
              data-empty={!selectedRange}
              type="button"
              variant="outline"
            />
          }
        >
          <IconCalendar data-icon="inline-start" />
          <span className="min-w-0 truncate">{selectedRange ? getDateRangeLabel(selectedRange) : 'Pick dates'}</span>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="range"
            numberOfMonths={1}
            onSelect={(range) => column.setFilterValue(getFilterValueFromDateRange(range))}
            selected={selectedRange}
          />
        </PopoverContent>
      </Popover>
      <ClearFilterButton disabled={!selectedRange} label={label} onClear={() => column.setFilterValue(undefined)} />
    </div>
  );
}

type ClearFilterButtonProps = {
  disabled: boolean;
  label: string;
  onClear: () => void;
};

function ClearFilterButton({ disabled, label, onClear }: ClearFilterButtonProps) {
  return (
    <Button
      aria-label={`Clear ${label} filter`}
      disabled={disabled}
      onClick={onClear}
      size="icon-sm"
      type="button"
      variant="outline"
    >
      <IconX />
    </Button>
  );
}

function getStringArrayFilterValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function getDateRangeFilterValue(value: unknown): { end?: string; start?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const range = value as { end?: unknown; start?: unknown };

  return {
    ...(typeof range.end === 'string' && range.end ? { end: range.end } : {}),
    ...(typeof range.start === 'string' && range.start ? { start: range.start } : {}),
  };
}

function getSelectedDateRange(value: { end?: string; start?: string }): DateRange | undefined {
  const from = value.start ? getDateFromFilterValue(value.start) : undefined;
  const to = value.end ? getDateFromFilterValue(value.end) : undefined;

  if (!from && !to) {
    return undefined;
  }

  return {
    from,
    ...(to ? { to } : {}),
  };
}

function getFilterValueFromDateRange(range: DateRange | undefined): { end?: string; start?: string } | undefined {
  if (!range?.from && !range?.to) {
    return undefined;
  }

  return {
    ...(range.from ? { start: getFilterValueFromDate(range.from) } : {}),
    ...(range.to ? { end: getFilterValueFromDate(range.to) } : {}),
  };
}

function getDateRangeLabel(range: DateRange): string {
  if (range.from && range.to) {
    return `${formatDate(range.from)} - ${formatDate(range.to)}`;
  }

  return formatDate(range.from ?? range.to);
}

function getDateFromFilterValue(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));

  if (!year || !month || !day) {
    return undefined;
  }

  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getFilterValueFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function hasActiveFilterValue(value: unknown): boolean {
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

function isRightAligned<TData>(header: Header<TData, unknown>): boolean {
  return header.column.columnDef.meta?.headerClassName?.includes('text-right') ?? false;
}
