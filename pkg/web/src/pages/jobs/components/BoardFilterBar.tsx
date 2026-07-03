import type { Bay, JobSummary, UUID } from '@pkg/schema';
import { IconFilterOff } from '@tabler/icons-react';
import type React from 'react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { bayOperatorName } from '@/components/bays/bay-label.js';
import { Button } from '@/components/ui/button.js';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox.js';
import { type BoardFilter, emptyBoardFilter, hasActiveBoardFilter } from './board-filter.js';
import { getJobOptionHint } from './job-display.js';

type FilterOption<TId extends string> = {
  id: TId;
  label: string;
  hint?: string;
};

type BoardFilterBarProps = {
  bays: ReadonlyArray<Pick<Bay, 'id' | 'name' | 'currentOperator'>>;
  filter: BoardFilter;
  jobs: ReadonlyArray<
    Pick<
      JobSummary,
      | 'id'
      | 'code'
      | 'customerCompanyName'
      | 'customerId'
      | 'productName'
      | 'productSerialNumber'
      | 'quoteKind'
      | 'workTitle'
    >
  >;
  noMatches: boolean;
  onFilterChange: (filter: BoardFilter) => void;
  trailingContent?: ReactNode;
};

export const BoardFilterBar: React.FC<BoardFilterBarProps> = ({
  bays,
  filter,
  jobs,
  noMatches,
  onFilterChange,
  trailingContent,
}) => {
  const jobOptions = useMemo<FilterOption<UUID>[]>(
    () => jobs.map((job) => ({ hint: getJobOptionHint(job), id: job.id, label: job.code })),
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
  const bayOptions = useMemo<FilterOption<UUID>[]>(
    () =>
      bays.map((bay) => {
        const operator = bayOperatorName(bay);
        return { id: bay.id, label: operator ? `${bay.name} - ${operator}` : bay.name };
      }),
    [bays],
  );
  const isActive = hasActiveBoardFilter(filter);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <FilterCombobox
        inputId="board-filter-job"
        onChange={(jobId) => onFilterChange({ ...filter, jobId })}
        options={jobOptions}
        placeholder="Filter by job"
        value={filter.jobId}
      />
      <FilterCombobox
        inputId="board-filter-customer"
        onChange={(customerId) => onFilterChange({ ...filter, customerId })}
        options={customerOptions}
        placeholder="Filter by customer"
        value={filter.customerId}
      />
      <FilterCombobox
        inputId="board-filter-bay"
        onChange={(bayId) => onFilterChange({ ...filter, bayId })}
        options={bayOptions}
        placeholder="Filter by bay"
        value={filter.bayId}
      />
      {isActive ? (
        <Button onClick={() => onFilterChange(emptyBoardFilter)} size="sm" type="button" variant="ghost">
          <IconFilterOff data-icon="inline-start" />
          Clear filters
        </Button>
      ) : null}
      {noMatches ? <span className="text-muted-foreground text-xs">No slots match the current filters.</span> : null}
      {trailingContent ? <div className="ml-auto flex items-center gap-1.5">{trailingContent}</div> : null}
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
