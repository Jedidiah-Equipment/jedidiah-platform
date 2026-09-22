import { formatCurrency } from '@pkg/domain';
import {
  formatFreeStock,
  formatPlateWorking,
  proposeQuoteInventoryPartRow,
  type QuoteInventoryPartRow,
  quoteInventoryPartBasis,
  quoteInventoryPartLabel,
  quoteInventoryPartPriceNote,
  quoteInventoryPartQuantityLabel,
} from '@pkg/domain/equipment';
import {
  QuoteInventoryPartLengthMm,
  type QuoteInventoryPartOption,
  QuoteInventoryPartPlatePercent,
  QuoteWorkItemPartQuantity,
} from '@pkg/schema/equipment';
import { IconX } from '@tabler/icons-react-native';
import { useStore } from '@tanstack/react-form';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { z } from 'zod';

import { useAppForm } from '@/components/form';
import { FieldShell } from '@/components/form/fields/FieldShell';
import { Icon } from '@/components/ui/icon';
import { PickerDropdown } from '@/components/ui/picker-dropdown';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { ThemedModal } from '@/components/ui/themed-modal';
import { useAppToast } from '@/components/ui/toast';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';

/**
 * Pre-fills an ordinary Work Item Part row from a catalog Part. The row keeps no link to the Part:
 * every field stays editable, and a later cost or markup change never reaches it.
 */
export function InventoryPartPicker({
  currencyCode,
  onAdd,
  onClose,
  open,
}: {
  currencyCode: string;
  onAdd: (row: QuoteInventoryPartRow) => void;
  onClose: () => void;
  open: boolean;
}) {
  const [part, setPart] = useState<QuoteInventoryPartOption | null>(null);
  const close = () => {
    setPart(null);
    onClose();
  };

  return (
    <ThemedModal backdropLabel="Cancel add inventory part" onClose={close} open={open}>
      <View
        className="w-full overflow-hidden rounded-[20px] border border-border bg-surface shadow-2xl"
        style={{ maxHeight: '92%', maxWidth: 400 }}
      >
        <View className="flex-row items-center justify-between px-5 pb-1 pt-4">
          <Text className="text-lg text-surface-foreground" weight="bold">
            Add inventory part
          </Text>
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            className="rounded-lg p-2 active:bg-muted"
            onPress={close}
          >
            <Icon className="text-muted-foreground" icon={IconX} size={20} />
          </Pressable>
        </View>
        {open ? <PartSearchField onSelected={setPart} part={part} /> : null}
        {part ? (
          <InventoryPartAmountForm
            currencyCode={currencyCode}
            key={part.id}
            onAdd={(row) => {
              onAdd(row);
              close();
            }}
            onCancel={close}
            part={part}
          />
        ) : (
          <PickerFooter onCancel={close} />
        )}
      </View>
    </ThemedModal>
  );
}

function PartSearchField({
  onSelected,
  part,
}: {
  onSelected: (part: QuoteInventoryPartOption | null) => void;
  part: QuoteInventoryPartOption | null;
}) {
  const trpc = useTRPC();
  const showToast = useAppToast();
  const [expanded, setExpanded] = useState(part === null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
  const results = useInfiniteQuery(
    trpc.quotes.inventoryParts.infiniteQueryOptions(
      { limit: 20, search: debouncedSearch },
      { getNextPageParam: (page) => page.nextCursor, initialCursor: 0, placeholderData: keepPreviousData },
    ),
  );
  const rows = useMemo(() => results.data?.pages.flatMap((page) => page.items) ?? [], [results.data?.pages]);

  useEffect(() => {
    if (results.isError) showToast('error', 'Couldn’t search Parts. Please try again.');
  }, [results.isError, showToast]);

  return (
    <View className="px-5 pb-2 pt-3">
      <FieldShell errors={[]} label="Part">
        <TextInput
          accessibilityLabel="Part"
          className="h-12"
          selectTextOnFocus
          onChangeText={(value) => {
            if (part) onSelected(null);
            setSearch(value);
            setExpanded(true);
          }}
          // A picked Part keeps its label and amounts until the salesperson types over it.
          onFocus={() => {
            if (!part) setExpanded(true);
          }}
          placeholder={results.isFetching ? 'Searching Parts…' : 'Search by code, name, or Part Category'}
          value={expanded || !part ? search : quoteInventoryPartLabel(part)}
        />
        <PickerDropdown
          emptyMessage="No Parts found."
          keyOf={(row) => row.id}
          loadingMore={results.isFetchingNextPage}
          onLoadMore={() => {
            if (results.hasNextPage && !results.isFetchingNextPage) void results.fetchNextPage();
          }}
          onSelect={(row) => {
            onSelected(row);
            setSearch('');
            setExpanded(false);
          }}
          open={expanded}
          pending={results.isPending}
          renderRow={(row) => (
            <>
              <View className="min-w-0 flex-1">
                <Text className="text-sm text-surface-foreground" numberOfLines={1} weight="semibold">
                  {quoteInventoryPartLabel(row)}
                </Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {row.partCategoryName}
                </Text>
              </View>
              <Text
                className={`shrink-0 text-xs ${row.freeQuantity > 0 ? 'text-surface-foreground' : 'text-muted-foreground'}`}
                mono
              >
                {formatFreeStock(row)}
              </Text>
            </>
          )}
          rows={rows}
        />
      </FieldShell>
    </View>
  );
}

function InventoryPartAmountForm({
  currencyCode,
  onAdd,
  onCancel,
  part,
}: {
  currencyCode: string;
  onAdd: (row: QuoteInventoryPartRow) => void;
  onCancel: () => void;
  part: QuoteInventoryPartOption;
}) {
  const basis = quoteInventoryPartBasis(part);
  const form = useAppForm({
    defaultValues: {
      lengthMm: part.standardPurchaseLengthMm ?? Number.NaN,
      platePercent: Number.NaN,
      quantity: 1,
    },
    onSubmit: () => undefined,
  });
  const values = useStore(form.store, (state) => state.values);
  const lengthMm = parseAmount(QuoteInventoryPartLengthMm, values.lengthMm);
  const platePercent = parseAmount(QuoteInventoryPartPlatePercent, values.platePercent);
  const quantity = parseAmount(QuoteWorkItemPartQuantity, values.quantity);
  const row = proposeQuoteInventoryPartRow(part, { lengthMm, platePercent, quantity });

  return (
    <>
      <ScrollView contentContainerClassName="gap-4 px-5 pb-4 pt-2" keyboardShouldPersistTaps="handled">
        {basis === 'length' ? (
          <form.AppField name="lengthMm" validators={{ onChange: fieldValidator(QuoteInventoryPartLengthMm) }}>
            {(field) => <field.NumberField label="Length (mm)" />}
          </form.AppField>
        ) : null}
        {basis === 'plate' ? (
          <View className="gap-1.5">
            <form.AppField
              name="platePercent"
              validators={{ onChange: fieldValidator(QuoteInventoryPartPlatePercent) }}
            >
              {(field) => <field.NumberField label="% of plate" />}
            </form.AppField>
            {platePercent !== null && part.averageUtilizationPercent !== null ? (
              <Text className="text-xs text-muted-foreground">
                {formatPlateWorking(platePercent, part.averageUtilizationPercent)}
              </Text>
            ) : null}
          </View>
        ) : null}
        <form.AppField name="quantity" validators={{ onChange: fieldValidator(QuoteWorkItemPartQuantity) }}>
          {(field) => <field.NumberField label={quoteInventoryPartQuantityLabel(basis)} />}
        </form.AppField>
        {part.priceNote ? (
          <View className="rounded-xl border border-border bg-muted px-3 py-2.5">
            <Text className="text-sm text-foreground">{quoteInventoryPartPriceNote(part, currencyCode)}</Text>
          </View>
        ) : (
          <View className="flex-row items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
            <Text className="text-sm text-foreground" weight="semibold">
              Unit price
            </Text>
            <Text className="text-sm text-foreground" mono>
              {row === null ? '—' : formatCurrency(row.unitPrice, currencyCode)}
            </Text>
          </View>
        )}
      </ScrollView>
      <PickerFooter
        add={{
          disabled: row === null,
          onPress: () => {
            if (row) onAdd(row);
          },
        }}
        onCancel={onCancel}
      />
    </>
  );
}

function PickerFooter({ add, onCancel }: { add?: { disabled: boolean; onPress: () => void }; onCancel: () => void }) {
  return (
    <View className="flex-row justify-end gap-2.5 border-t border-border px-5 pb-5 pt-4">
      <Pressable
        accessibilityRole="button"
        className="rounded-xl border border-border bg-muted px-5 py-3 active:opacity-80"
        onPress={onCancel}
      >
        <Text className="text-sm text-foreground" weight="semibold">
          Cancel
        </Text>
      </Pressable>
      {add ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: add.disabled }}
          className={`rounded-xl bg-primary px-5 py-3 ${add.disabled ? 'opacity-60' : 'active:opacity-90'}`}
          disabled={add.disabled}
          onPress={add.onPress}
        >
          <Text className="text-sm text-primary-foreground" weight="bold">
            Add to work item
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** An empty box (NaN) is not an error yet; it only keeps Add disabled. */
function fieldValidator(schema: z.ZodType<number>) {
  return ({ value }: { value: number }) =>
    Number.isNaN(value) ? undefined : schema.safeParse(value).error?.issues[0]?.message;
}

function parseAmount(schema: z.ZodType<number>, value: number): number | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
