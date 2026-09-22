import type { InventoryQuoteOption } from '@pkg/schema/equipment';

import { EntityCombobox } from '@/components/common/EntityCombobox.js';
import type { InventoryQuotePickerController } from '@/equipment/hooks/options/index.js';

/** Picks the Parts Sale stock leaves for, or comes back from. Shows no price: stores are price-blind by role. */
export function InventoryQuotePicker({
  controller,
  inputId,
  onSelected,
  value,
}: {
  controller: InventoryQuotePickerController;
  inputId: string;
  onSelected: (quote: InventoryQuoteOption | null) => void;
  value: InventoryQuoteOption | null;
}) {
  return (
    <EntityCombobox
      disabled={controller.isPending}
      emptyMessage="No Parts Sales found."
      inputId={inputId}
      inputValue={controller.search}
      isFetching={controller.isFetching}
      itemToLabel={quoteOptionLabel}
      loadMore={{
        hasNextPage: controller.hasNextPage,
        isFetchingNextPage: controller.isFetchingNextPage,
        loadedCount: controller.items.length,
        onLoadMore: controller.loadMore,
        total: controller.total,
        totalLabel: (total) => `${total} ${total === 1 ? 'Parts Sale' : 'Parts Sales'}`,
      }}
      onInputValueChange={controller.setSearch}
      onSelected={(next) => {
        onSelected(next);
        controller.setSearch('');
      }}
      options={controller.items}
      placeholder="Select Parts Sale"
      renderItem={(quote) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-mono text-sm">{quote.code}</span>
          <span className="truncate text-muted-foreground text-xs">
            {quote.customerCompanyName} · {quote.workTitle}
          </span>
        </span>
      )}
      searchPlaceholder="Search by code, Customer, or work title"
      value={value}
    />
  );
}

function quoteOptionLabel(quote: InventoryQuoteOption): string {
  return `${quote.code} · ${quote.customerCompanyName}`;
}
