import { formatCurrency, formatDate } from '@pkg/domain';
import { pricePersistedQuote } from '@pkg/domain/equipment';
import type { QuoteSummary } from '@pkg/schema/equipment';
import { IconAlertTriangle, IconArrowsSort, IconFilter } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { CatalogListCard } from '@/components/CatalogList';
import {
  type ListControlOption,
  ListControlRow,
  ListCreateControl,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { offeringAvatarProps } from '@/equipment/components/OfferingAvatar';
import { QuoteStageChip } from '@/equipment/components/quotes/QuoteStageChip';
import { QUOTE_STAGE_FILTER_OPTIONS, type QuoteSort, type QuoteStageFilter } from '@/equipment/lib/quote-presentation';
import { useColorMode } from '@/theme/use-color-mode';

const STAGE_OPTIONS: readonly ListControlOption<QuoteStageFilter>[] = [
  { label: 'All stages', value: 'all' },
  ...QUOTE_STAGE_FILTER_OPTIONS,
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
  onStageChange,
  search,
  sort,
  stage,
}: {
  canCreate: boolean;
  onCreate: () => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: QuoteSort) => void;
  onStageChange: (stage: QuoteStageFilter) => void;
  search: string;
  sort: QuoteSort;
  stage: QuoteStageFilter;
}) {
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
            accessibilityLabel="Filter quotes by stage"
            defaultValue="all"
            dismissLabel="Dismiss Quote stage filter"
            icon={IconFilter}
            onChange={onStageChange}
            options={STAGE_OPTIONS}
            value={stage}
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
          {canCreate ? <ListCreateControl label="New quote" onPress={onCreate} /> : null}
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
  const { resolved } = useColorMode();
  const avatar = offeringAvatarProps(quote.kind, resolved);

  return (
    <CatalogListCard
      accessibilityHint="Opens Quote details"
      accessibilityLabel={`Quote ${quote.code}`}
      avatarClassName={avatar.className}
      avatarFallback={avatar.fallback}
      avatarName={offering}
      avatarUri={quote.kind === 'product' ? quote.product?.thumbnailDataUrl : null}
      mainText={quote.customerCompanyName}
      monoText={`${quote.code} · ${formatDate(quote.createdAt, 'short')}`}
      onPress={() => router.push({ pathname: '/equipment/quotes/[quoteId]', params: { quoteId: quote.id } })}
      subText={offering}
      trailing={
        <View className="items-end gap-1.5">
          <Text className="text-[15px] text-primary" numberOfLines={1} weight="bold">
            {formatCurrency(total, quote.quotedCurrencyCode, { decimals: 0 })}
          </Text>
          <QuoteStageChip stage={quote.stage} />
        </View>
      }
    />
  );
}
