import { getJobDisplayName, getJobOfferingKind } from '@pkg/domain';
import type { JobPickerOption, JobPickerTab } from '@pkg/schema';
import type React from 'react';

import { EntityComboboxLoadMore } from '@/components/common/EntityCombobox.js';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from '@/components/ui/combobox.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { OfferingThumbnail } from '@/equipment/components/thumbnail/OfferingThumbnail.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { JOB_PICKER_SEARCH_PLACEHOLDER, JOB_PICKER_TABS } from './job-picker-model.js';
import type { JobPickerController } from './use-job-picker.js';

type JobPickerPopupProps = {
  align?: 'start' | 'center' | 'end';
  controller: JobPickerController;
  disabled?: boolean;
  nothingPickableMessage?: string;
};

type JobPickerProps = JobPickerPopupProps & {
  /** The trigger the picker hangs off; it owns how a selected Job reads when the popup is shut. */
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  onSelect: (job: JobPickerOption) => void;
  open: boolean;
  value: JobPickerOption | null;
};

/**
 * Finding one Job among hundreds. Three recency lists carry the reader most of the way — a Job is
 * usually the one that just moved, or the one just raised, or simply one of the open ones — and the
 * search behind them reaches every Job by any of the four facts a person remembers it by.
 */
export function JobPicker({
  align = 'start',
  children,
  controller,
  disabled = false,
  nothingPickableMessage,
  onOpenChange,
  onSelect,
  open,
  value,
}: JobPickerProps) {
  return (
    <Combobox<JobPickerOption>
      autoHighlight
      disabled={disabled}
      filter={null}
      inputValue={controller.search}
      isItemEqualToValue={(option, selected) => option.id === selected.id}
      items={controller.rows}
      itemToStringLabel={(job) => job.code}
      itemToStringValue={(job) => job.id}
      onInputValueChange={controller.setSearch}
      onOpenChange={(nextOpen) => {
        if (nextOpen) controller.onOpen();
        onOpenChange(nextOpen);
      }}
      onValueChange={(job) => {
        if (disabled || !job) return;

        onSelect(job);
        controller.setSearch('');
        onOpenChange(false);
      }}
      open={open}
      value={value}
    >
      {children}
      <JobPickerPopup
        align={align}
        controller={controller}
        disabled={disabled}
        {...(nothingPickableMessage ? { nothingPickableMessage } : {})}
        withSearchInput
      />
    </Combobox>
  );
}

type JobMultiPickerProps = JobPickerPopupProps & {
  id?: string;
  onChange: (jobs: JobPickerOption[]) => void;
  placeholder?: string;
  value: JobPickerOption[];
};

/**
 * The same three lists where a surface names a set of Jobs rather than one. The chips are the
 * trigger and carry the search, so there is no second input in the popup competing for the caret.
 */
export function JobMultiPicker({
  align = 'start',
  controller,
  disabled = false,
  id,
  nothingPickableMessage,
  onChange,
  placeholder = JOB_PICKER_SEARCH_PLACEHOLDER,
  value,
}: JobMultiPickerProps) {
  return (
    <Combobox<JobPickerOption, true>
      disabled={disabled}
      filter={null}
      inputValue={controller.search}
      isItemEqualToValue={(option, selected) => option.id === selected.id}
      items={controller.rows}
      itemToStringLabel={(job) => job.code}
      itemToStringValue={(job) => job.id}
      multiple
      onInputValueChange={controller.setSearch}
      onOpenChange={(nextOpen) => {
        if (nextOpen) controller.onOpen();
      }}
      onValueChange={(jobs) => {
        if (disabled) return;

        onChange(jobs);
      }}
      value={value}
    >
      <ComboboxChipsTrigger disabled={disabled} id={id} placeholder={placeholder} value={value} />
      <JobPickerPopup
        align={align}
        controller={controller}
        disabled={disabled}
        {...(nothingPickableMessage ? { nothingPickableMessage } : {})}
      />
    </Combobox>
  );
}

/** The multi picker's trigger: what is already chosen, and the field the search is typed into. */
function ComboboxChipsTrigger({
  disabled,
  id,
  placeholder,
  value,
}: {
  disabled: boolean;
  id?: string | undefined;
  placeholder: string;
  value: readonly JobPickerOption[];
}) {
  return (
    <ComboboxChips>
      <ComboboxValue>
        {value.map((job) => (
          <ComboboxChip className="font-mono" key={job.id}>
            {job.code}
          </ComboboxChip>
        ))}
      </ComboboxValue>
      <ComboboxChipsInput disabled={disabled} id={id} placeholder={placeholder} />
    </ComboboxChips>
  );
}

/** Shared body of both pickers: the search field where there is one, the tabs, the rows, the count. */
function JobPickerPopup({
  align,
  controller,
  disabled = false,
  nothingPickableMessage = 'No Jobs are available to select.',
  withSearchInput = false,
}: JobPickerPopupProps & { withSearchInput?: boolean }) {
  return (
    <ComboboxContent align={align} className="min-w-88">
      {/* No clear in the search field: Base UI mounts one as soon as a Job is selected, where it
          reads as "clear the search" beside a search placeholder while it actually drops the
          selection. Clearing belongs beside the trigger, which is where the selection is shown. */}
      {withSearchInput ? (
        <ComboboxInput
          disabled={disabled}
          // The placeholder names all four fields the search reaches, which is longer than the
          // popup at its narrowest; ellipsis says it is cut off rather than that it ends there.
          inputClassName="text-ellipsis"
          placeholder={JOB_PICKER_SEARCH_PLACEHOLDER}
          showClear={false}
          showTrigger={false}
        />
      ) : null}
      <JobPickerTabs controller={controller} disabled={disabled} />
      {controller.isLoading ? (
        <div className="px-3 py-6 text-center text-muted-foreground text-sm">Loading Jobs…</div>
      ) : controller.error ? (
        <div className="px-3 py-6 text-center text-destructive text-sm">
          {getApiQueryErrorMessage(controller.error, 'Unable to load Jobs.')}
        </div>
      ) : (
        <>
          <ComboboxEmpty>{emptyMessage(controller, nothingPickableMessage)}</ComboboxEmpty>
          <ComboboxList>
            {(job: JobPickerOption) => (
              <ComboboxItem className="items-center rounded-lg py-1.5" key={job.id} value={job}>
                <JobPickerOptionRow job={job} />
              </ComboboxItem>
            )}
          </ComboboxList>
          <EntityComboboxLoadMore
            hasNextPage={controller.hasMore}
            isFetchingNextPage={controller.isLoadingMore}
            loadedCount={controller.rows.length}
            onLoadMore={controller.onLoadMore}
            total={controller.total}
            totalLabel={(total) => `${total} ${total === 1 ? 'Job' : 'Jobs'}`}
          />
        </>
      )}
    </ComboboxContent>
  );
}

/**
 * What an empty list says. A search narrows the tab rather than escaping it, so a search that finds
 * nothing under Not complete names that constraint — otherwise a completed Job that is still pickable
 * one tab over reads as a Job that does not exist.
 */
function emptyMessage(controller: JobPickerController, nothingPickableMessage: string): string {
  const search = controller.search.trim();
  if (!search) return nothingPickableMessage;

  return controller.activeTab === 'incomplete'
    ? `No Jobs match “${search}” that are not complete. Try Last updated or Last created.`
    : `No Jobs match “${search}”.`;
}

/**
 * One Job as the picker draws it: what kind of work it is, the code that names it, and the Product
 * or work title a person actually recognises.
 */
function JobPickerOptionRow({ job }: { job: JobPickerOption }) {
  const displayName = getJobDisplayName(job);

  return (
    <>
      <OfferingThumbnail
        kind={getJobOfferingKind(job)}
        label={displayName}
        preview={false}
        size="sm"
        thumbnailDataUrl={job.productThumbnailDataUrl}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-xs">{job.code}</span>
        <span className="truncate text-muted-foreground text-xs">{displayName}</span>
      </span>
    </>
  );
}

/**
 * The shared `Tabs`, so the three lists read like every other tab strip in the app. There is no
 * `TabsContent`: what a tab picks is the combobox's own list, which cannot also be a tab panel.
 */
function JobPickerTabs({ controller, disabled }: { controller: JobPickerController; disabled: boolean }) {
  return (
    <Tabs
      className="px-1 pt-1"
      onValueChange={(tab) => controller.setActiveTab(tab as JobPickerTab)}
      value={controller.activeTab}
    >
      <TabsList aria-label="Job list" className="w-full">
        {JOB_PICKER_TABS.map(({ label, tab }) => (
          <TabsTrigger className="text-xs" disabled={disabled} key={tab} onPointerDown={keepCaretInSearch} value={tab}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/**
 * Changing lists must not cost the reader their place in the search field — they are usually
 * mid-search when they reach for another tab. `EntityComboboxLoadMore` swallows the same press for
 * the same reason, but on `mousedown`, which is too late here: a Base UI tab takes focus on
 * `pointerdown`, and the combobox answers the input's `focusout` by pulling focus out to the
 * trigger. Swallowing the pointer press leaves the caret where it was; the tab still activates on
 * the click that follows.
 */
function keepCaretInSearch(event: React.PointerEvent<HTMLButtonElement>): void {
  event.preventDefault();
}
