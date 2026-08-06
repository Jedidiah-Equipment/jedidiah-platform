import type React from 'react';

import { Button } from '@/components/ui/button.js';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox.js';

type EntityComboboxLoadMoreProps = {
  hasNextPage: boolean;
  isFetchingNextPage?: boolean;
  loadedCount: number;
  onLoadMore: () => void;
  total: number;
  totalLabel: (total: number) => React.ReactNode;
};

type EntityComboboxProps<TOption extends { id: string }> = {
  disabled: boolean;
  emptyMessage: string;
  inputId: string;
  inputValue: string;
  isFetching: boolean;
  itemToLabel: (option: TOption) => string;
  /** Paged option reads pass this so the popup says what it has loaded instead of stopping silently. */
  loadMore?: EntityComboboxLoadMoreProps;
  onInputValueChange: (value: string) => void;
  onSelected: (option: TOption | null) => void;
  options: TOption[];
  placeholder: string;
  renderItem: (option: TOption) => React.ReactNode;
  searchPlaceholder: string;
  value: TOption | null;
};

const getEntityOptionId = <TOption extends { id: string }>(option: TOption) => option.id;

export function EntityCombobox<TOption extends { id: string }>({
  disabled,
  emptyMessage,
  inputId,
  inputValue,
  isFetching,
  itemToLabel,
  loadMore,
  onInputValueChange,
  onSelected,
  options,
  placeholder,
  renderItem,
  searchPlaceholder,
  value,
}: EntityComboboxProps<TOption>) {
  const selectedLabel = value ? itemToLabel(value) : '';
  const displayInputValue = inputValue || selectedLabel;

  return (
    <Combobox
      disabled={disabled}
      filter={null}
      inputValue={displayInputValue}
      itemToStringLabel={itemToLabel}
      itemToStringValue={getEntityOptionId}
      items={options}
      onInputValueChange={(nextInputValue, eventDetails) => {
        if (eventDetails.reason === 'item-press' || nextInputValue === displayInputValue) {
          return;
        }

        onInputValueChange(nextInputValue);
      }}
      onValueChange={(nextOption) => {
        if ((nextOption?.id ?? null) === (value?.id ?? null)) {
          return;
        }

        onSelected(nextOption);
      }}
      value={value}
    >
      <ComboboxInput
        className="w-full"
        disabled={disabled}
        id={inputId}
        placeholder={isFetching ? searchPlaceholder : placeholder}
        showClear
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(option: TOption) => (
            <ComboboxItem key={option.id} value={option}>
              {renderItem(option)}
            </ComboboxItem>
          )}
        </ComboboxList>
        {loadMore ? <EntityComboboxLoadMore {...loadMore} /> : null}
      </ComboboxContent>
    </Combobox>
  );
}

/**
 * The paged picker's footer. It sits under the list rather than inside it so paging never reads as
 * a selectable option, and a pointer press is swallowed before focus leaves the input, which would
 * otherwise take the caret out of the search field on the way to the next page. Paging is deliberately
 * this button alone: the list's scroll position cannot tell a reader reaching the end from Base UI
 * scrolling the selected option into view on open, so paging on scroll fetches pages nobody asked for.
 */
export function EntityComboboxLoadMore({
  hasNextPage,
  isFetchingNextPage = false,
  loadedCount,
  onLoadMore,
  total,
  totalLabel,
}: EntityComboboxLoadMoreProps) {
  if (loadedCount === 0) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-t px-2 py-1 text-xs text-muted-foreground">
      <span>
        {loadedCount} of {totalLabel(total)}
      </span>
      {hasNextPage ? (
        <Button
          disabled={isFetchingNextPage}
          onClick={onLoadMore}
          onMouseDown={(event) => event.preventDefault()}
          size="sm"
          type="button"
          variant="link"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  );
}

export function mergeSelectedOption<TOption extends { id: string }>(
  options: readonly TOption[],
  selected: TOption | null | undefined,
): TOption[] {
  if (!selected || options.some((option) => option.id === selected.id)) {
    return [...options];
  }

  return [...options, selected];
}
