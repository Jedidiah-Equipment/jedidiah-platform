import type { JobSummary, UUID } from '@pkg/schema';
import { IconFilterOff } from '@tabler/icons-react';
import type React from 'react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button.js';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox.js';
import { type BayScheduleFilter, emptyBayScheduleFilter, hasActiveBayScheduleFilter } from './bay-schedule-filter.js';

type FilterOption<TId extends string> = {
  id: TId;
  label: string;
  hint?: string;
};

type BayScheduleFilterBarProps = {
  bays: ReadonlyArray<{ id: UUID; name: string }>;
  filter: BayScheduleFilter;
  jobs: ReadonlyArray<Pick<JobSummary, 'id' | 'code' | 'customerCompanyName' | 'customerId' | 'productSerialNumber'>>;
  noMatches: boolean;
  onFilterChange: (filter: BayScheduleFilter) => void;
};

export const BayScheduleFilterBar: React.FC<BayScheduleFilterBarProps> = ({
  bays,
  filter,
  jobs,
  noMatches,
  onFilterChange,
}) => {
  const jobOptions = useMemo<FilterOption<UUID>[]>(
    () => jobs.map((job) => ({ hint: job.productSerialNumber, id: job.id, label: job.code })),
    [jobs],
  );
  const customerOptions = useMemo<FilterOption<UUID>[]>(() => {
    const labelsByCustomerId = new Map<UUID, string>();

    for (const job of jobs) {
      if (job.customerCompanyName && !labelsByCustomerId.has(job.customerId)) {
        labelsByCustomerId.set(job.customerId, job.customerCompanyName);
      }
    }

    return [...labelsByCustomerId].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [jobs]);
  const bayOptions = useMemo<FilterOption<UUID>[]>(() => bays.map((bay) => ({ id: bay.id, label: bay.name })), [bays]);
  const isActive = hasActiveBayScheduleFilter(filter);

  return (
    <div className="flex flex-wrap items-center gap-3 border-border/70 border-y bg-background py-3">
      <FilterCombobox
        inputId="bay-schedule-filter-job"
        onChange={(jobId) => onFilterChange({ ...filter, jobId })}
        options={jobOptions}
        placeholder="Filter by job"
        value={filter.jobId}
      />
      <FilterCombobox
        inputId="bay-schedule-filter-customer"
        onChange={(customerId) => onFilterChange({ ...filter, customerId })}
        options={customerOptions}
        placeholder="Filter by customer"
        value={filter.customerId}
      />
      <FilterCombobox
        inputId="bay-schedule-filter-bay"
        onChange={(bayId) => onFilterChange({ ...filter, bayId })}
        options={bayOptions}
        placeholder="Filter by bay"
        value={filter.bayId}
      />
      {isActive ? (
        <Button onClick={() => onFilterChange(emptyBayScheduleFilter)} size="sm" type="button" variant="ghost">
          <IconFilterOff data-icon="inline-start" />
          Clear filters
        </Button>
      ) : null}
      {noMatches ? <span className="text-muted-foreground text-xs">No slots match the current filters.</span> : null}
    </div>
  );
};

function FilterCombobox<TId extends string>({
  inputId,
  onChange,
  options,
  placeholder,
  value,
}: {
  inputId: string;
  onChange: (id: TId | null) => void;
  options: FilterOption<TId>[];
  placeholder: string;
  value: TId | null;
}) {
  const selected = options.find((option) => option.id === value) ?? null;

  return (
    <Combobox
      itemToStringLabel={(option: FilterOption<TId>) => option.label}
      itemToStringValue={(option: FilterOption<TId>) => option.id}
      items={options}
      onValueChange={(option: FilterOption<TId> | null) => onChange(option?.id ?? null)}
      value={selected}
    >
      <ComboboxInput className="w-56" id={inputId} placeholder={placeholder} showClear />
      <ComboboxContent>
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(option: FilterOption<TId>) => (
            <ComboboxItem key={option.id} value={option}>
              <span className="min-w-0 truncate">{option.label}</span>
              {option.hint ? <span className="shrink-0 text-muted-foreground text-xs">{option.hint}</span> : null}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
