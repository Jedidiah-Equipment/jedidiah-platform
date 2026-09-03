import { departmentLabels, JOB_DEPARTMENT_PIPELINE } from '@pkg/domain';
import type { Bay, Department, JobPickerOption, JobSummary, UUID } from '@pkg/schema';
import type React from 'react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ResetFiltersButton } from '@/components/common/ResetFiltersButton.js';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox.js';
import { bayOperatorName } from '@/equipment/components/bays/bay-label.js';
import { JobPicker, JobPickerTrigger, useJobPicker } from '@/equipment/components/job-picker/index.js';
import { type BoardFilter, emptyBoardFilter, hasActiveBoardFilter } from './board-filter.js';

type FilterOption<TId extends string> = {
  id: TId;
  label: string;
};

type BoardFilterBarProps = {
  bays: ReadonlyArray<Pick<Bay, 'id' | 'name' | 'currentOperator' | 'department'>>;
  filter: BoardFilter;
  jobs: ReadonlyArray<
    Pick<
      JobSummary,
      | 'id'
      | 'code'
      | 'completedOn'
      | 'createdAt'
      | 'customerCompanyName'
      | 'customerId'
      | 'productName'
      | 'productThumbnailDataUrl'
      | 'quoteKind'
      | 'updatedAt'
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
  const customerOptions = useMemo<FilterOption<UUID>[]>(() => {
    const labelsByCustomerId = new Map<UUID, string>();

    for (const job of jobs) {
      // A Job on a machine we hold has no Customer to filter by; it reads as Stock instead.
      if (job.customerId && job.customerCompanyName && !labelsByCustomerId.has(job.customerId)) {
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
  const departmentOptions = useMemo<FilterOption<Department>[]>(() => {
    const availableDepartments = new Set(bays.map((bay) => bay.department));

    return JOB_DEPARTMENT_PIPELINE.filter(({ department }) => availableDepartments.has(department)).map(
      ({ department }) => ({ id: department, label: departmentLabels[department] }),
    );
  }, [bays]);
  const isActive = hasActiveBoardFilter(filter);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <BoardJobFilter jobs={jobs} onChange={(jobId) => onFilterChange({ ...filter, jobId })} value={filter.jobId} />
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
      <FilterCombobox
        inputId="board-filter-department"
        onChange={(department) => onFilterChange({ ...filter, department })}
        options={departmentOptions}
        placeholder="Filter by department"
        value={filter.department}
      />
      {isActive ? <ResetFiltersButton label="Clear filters" onReset={() => onFilterChange(emptyBoardFilter)} /> : null}
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
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/**
 * The Board's Job filter. It picks from the Jobs the Board is showing rather than every Job there
 * is: this narrows what is already on screen, and a Job with no Slot in view would filter the Board
 * down to nothing while reading as a legitimate choice.
 */
function BoardJobFilter({
  jobs,
  onChange,
  value,
}: {
  jobs: readonly JobPickerOption[];
  onChange: (jobId: UUID | null) => void;
  value: UUID | null;
}) {
  const [open, setOpen] = useState(false);
  const controller = useJobPicker({ options: jobs });
  const selected = jobs.find((job) => job.id === value) ?? null;

  return (
    <JobPicker
      controller={controller}
      nothingPickableMessage="No Jobs are on the Board."
      onOpenChange={setOpen}
      onSelect={(job) => onChange(job.id)}
      open={open}
      value={selected}
    >
      <JobPickerTrigger
        className="w-64"
        clearLabel="Clear Job filter"
        id="board-filter-job"
        onClear={() => onChange(null)}
        placeholder="Filter by Job"
        value={selected}
      />
    </JobPicker>
  );
}
