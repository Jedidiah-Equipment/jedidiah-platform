import { recipientLabel } from '@pkg/domain/equipment';
import type { InventoryRecipientOption } from '@pkg/schema/equipment';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';

import { StoresOptionPicker } from './StoresOptionPicker';

const RECIPIENT_PAGE_SIZE = 20;

/**
 * Who is receiving a Checkout Without a Job: any active Equipment person, not only the quick-switch grid,
 * or a Contracting Driver or Mechanic, named with the role.
 */
export function RecipientPicker({
  onSearchChange,
  onSelect,
  search,
  selected,
}: {
  onSearchChange: (value: string) => void;
  onSelect: (person: InventoryRecipientOption | null) => void;
  search: string;
  selected: InventoryRecipientOption | null;
}) {
  const trpc = useTRPC();
  const debouncedSearch = useDebouncedSearch(search);
  const people = useInfiniteQuery(
    trpc.inventory.recipientOptions.infiniteQueryOptions(
      { limit: RECIPIENT_PAGE_SIZE, search: debouncedSearch },
      {
        enabled: selected === null,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const items = useMemo(() => people.data?.pages.flatMap((page) => page.items) ?? [], [people.data?.pages]);

  return (
    <StoresOptionPicker
      accessibilityLabel={recipientLabel}
      changeHint="Choose a different person"
      emptyMessage="No active Equipment person, Driver or Mechanic matches."
      label="RECEIVED BY"
      noun="people"
      onSearchChange={onSearchChange}
      onSelect={onSelect}
      paging="button"
      query={{ ...people, items }}
      renderOption={(person) => (
        <Text className="text-base text-surface-foreground" weight="semibold">
          {recipientLabel(person)}
        </Text>
      )}
      search={search}
      searchLabel="Search people"
      searchPlaceholder="Search people"
      selected={selected}
    />
  );
}
