import { formatCurrency, formatDate, pricePersistedQuote } from '@pkg/domain';
import type { QuoteSummary } from '@pkg/schema';
import { IconAlertTriangle, IconArrowsSort, IconFilter, IconPlus } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { CatalogListCard } from '@/components/CatalogList';
import {
  type ListControlOption,
  ListControlRow,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { offeringAvatarProps } from '@/components/OfferingAvatar';
import { QuoteStatusChip } from '@/components/quotes/QuoteStatusChip';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { QUOTE_STATUS_OPTIONS, type QuoteSort, type QuoteStatusFilter } from '@/lib/quote-presentation';

const WIDE_BREAKPOINT = 760;
const STATUS_OPTIONS: readonly ListControlOption<QuoteStatusFilter>[] = [
  { label: 'All statuses', value: 'all' },
  ...QUOTE_STATUS_OPTIONS,
];
const QUOTE_SORT_OPTIONS: readonly ListControlOption<QuoteSort>[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
];

export function QuoteCatalogControls({
  canCreate,
  onCreate,
  onSearchChange,
  onSortChange,
  onStatusChange,
  search,
  sort,
  status,
}: {
  canCreate: boolean;
  onCreate: () => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: QuoteSort) => void;
  onStatusChange: (status: QuoteStatusFilter) => void;
  search: string;
  sort: QuoteSort;
  status: QuoteStatusFilter;
}) {
  const isWide = useWindowDimensions().width >= WIDE_BREAKPOINT;

  return (
    <ListControlRow
      leading={
        <ListSearchControl
          accessibilityLabel="Search quotes"
          onChangeText={onSearchChange}
          placeholder="Search by quote code, customer, product, or job…"
          value={search}
        />
      }
      trailing={
        <View className="flex-row items-center gap-2">
          <ListDropdownControl
            accessibilityLabel="Filter quotes by status"
            defaultValue="all"
            dismissLabel="Dismiss Quote status filter"
            icon={IconFilter}
            onChange={onStatusChange}
            options={STATUS_OPTIONS}
            value={status}
          />
          <ListDropdownControl
            accessibilityLabel="Sort quotes"
            defaultValue="newest"
            dismissLabel="Dismiss Quote sort"
            icon={IconArrowsSort}
            onChange={onSortChange}
            options={QUOTE_SORT_OPTIONS}
            value={sort}
          />
          {canCreate ? (
            <Pressable
              accessibilityLabel="New quote"
              accessibilityRole="button"
              className="h-10 flex-row items-center gap-2 rounded-xl bg-primary px-3 active:opacity-90"
              onPress={onCreate}
            >
              <Icon className="text-primary-foreground" icon={IconPlus} size={18} strokeWidth={2.5} />
              {isWide ? (
                <Text className="text-toolbar text-primary-foreground" weight="bold">
                  New quote
                </Text>
              ) : null}
            </Pressable>
          ) : null}
        </View>
      }
    />
  );
}

export function QuotePriorityHeader() {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon className="text-primary" icon={IconAlertTriangle} size={14} />
      <Text className="text-[10px] tracking-widest text-primary" mono weight="semibold">
        PRIORITY
      </Text>
    </View>
  );
}

export function QuoteCatalogCard({ quote }: { quote: QuoteSummary }) {
  const router = useRouter();
  const offering = quote.kind === 'custom' ? quote.workTitle : (quote.product?.name ?? 'Product unavailable');
  const total = pricePersistedQuote(quote).total;
  const avatar = offeringAvatarProps(quote.kind);

  return (
    <CatalogListCard
      accessibilityHint="Opens Quote details"
      accessibilityLabel={`Quote ${quote.code}`}
      avatarClassName={avatar.className}
      avatarFallback={avatar.fallback}
      avatarName={offering}
      avatarUri={quote.kind === 'product' ? quote.product?.thumbnailDataUrl : null}
      mainText={quote.customerCompanyName}
      monoText={`${quote.code} · ${formatDate(quote.createdAt, 'd MMM yyyy')}`}
      onPress={() => router.push({ pathname: '/quotes/[quoteId]', params: { quoteId: quote.id } })}
      subText={offering}
      trailing={
        <View className="items-end gap-1.5">
          <Text className="text-[15px] text-primary" numberOfLines={1} weight="bold">
            {formatCurrency(total, quote.quotedCurrencyCode, { decimals: 0 })}
          </Text>
          <QuoteStatusChip status={quote.status} />
        </View>
      }
    />
  );
}
