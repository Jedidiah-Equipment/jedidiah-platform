import { formatCurrency, formatDate, priceQuote } from '@pkg/domain';
import { QuoteStatus, type QuoteSummary } from '@pkg/schema';
import { IconAlertTriangle, IconCheck, IconPlus, IconSearch } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { BoardGrid } from '@/components/bays/BoardGrid';
import { ListFilterButton } from '@/components/ListControls';
import { QuoteStatusChip } from '@/components/quotes/QuoteStatusChip';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Icon } from '@/components/ui/icon';
import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { type QuoteStatusFilter, quoteMetaLine, quoteStatusLabels } from '@/lib/quote-presentation';

const WIDE_BREAKPOINT = 760;
const QUOTE_SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const STATUS_OPTIONS: readonly { label: string; value: QuoteStatusFilter }[] = [
  { label: 'All statuses', value: 'all' },
  ...QuoteStatus.options.map((status) => ({ label: quoteStatusLabels[status], value: status })),
];

export function QuoteCatalogHeader({ count }: { count: number | null }) {
  return (
    <ScreenHeader
      subtitle={count === null ? 'Loading quotes…' : `${count} ${count === 1 ? 'quote' : 'quotes'}`}
      title="Quotes"
    />
  );
}

export function QuoteCatalogControls({
  canCreate,
  onCreate,
  onSearchChange,
  onStatusChange,
  search,
  status,
}: {
  canCreate: boolean;
  onCreate: () => void;
  onSearchChange: (search: string) => void;
  onStatusChange: (status: QuoteStatusFilter) => void;
  search: string;
  status: QuoteStatusFilter;
}) {
  const isWide = useWindowDimensions().width >= WIDE_BREAKPOINT;
  const filterRef = useRef<View>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ left: number; top: number } | null>(null);
  const statusLabel = status === 'all' ? 'All statuses' : quoteStatusLabels[status];

  const openMenu = () => {
    filterRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ left: Math.max(8, x + width - 220), top: y + height + 8 });
    });
  };

  const selectStatus = (next: QuoteStatusFilter) => {
    onStatusChange(next);
    setMenuAnchor(null);
  };

  return (
    <View className="z-10 h-10 flex-row items-center gap-2">
      <View className="h-10 min-w-0 flex-1 flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3">
        <Icon className="text-muted-foreground" icon={IconSearch} size={17} />
        <TextInput
          accessibilityLabel="Search quotes"
          className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 py-0"
          onChangeText={onSearchChange}
          placeholder="Search quotes…"
          returnKeyType="search"
          textSize="toolbar"
          value={search}
        />
      </View>

      <ListFilterButton
        accessibilityLabel={`Filter by status: ${statusLabel}`}
        active={status !== 'all'}
        expanded={menuAnchor !== null}
        label={statusLabel.toUpperCase()}
        onPress={openMenu}
        ref={filterRef}
        showLabel={isWide}
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
            <Text className="text-[13px] text-primary-foreground" weight="bold">
              New quote
            </Text>
          ) : null}
        </Pressable>
      ) : null}

      {menuAnchor ? (
        <AnchoredMenu
          dismissLabel="Dismiss Quote status filter"
          onClose={() => setMenuAnchor(null)}
          style={{ left: menuAnchor.left, top: menuAnchor.top, width: 220 }}
        >
          <View className="p-1.5">
            {STATUS_OPTIONS.map((option) => (
              <StatusOption
                key={option.value}
                active={status === option.value}
                label={option.label}
                onPress={() => selectStatus(option.value)}
              />
            ))}
          </View>
        </AnchoredMenu>
      ) : null}
    </View>
  );
}

function StatusOption({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="flex-row items-center justify-between gap-3 rounded-xl px-3 py-2.5 active:bg-muted"
      onPress={onPress}
    >
      <Text className={active ? 'text-primary' : 'text-foreground'} weight="semibold">
        {label}
      </Text>
      {active ? <Icon className="text-primary" icon={IconCheck} size={15} /> : null}
    </Pressable>
  );
}

export function QuoteGrid({
  mainQuotes,
  priorityQuotes,
}: {
  mainQuotes: readonly QuoteSummary[];
  priorityQuotes: readonly QuoteSummary[];
}) {
  return (
    <View className="gap-5">
      {priorityQuotes.length > 0 ? (
        <View className="gap-2.5">
          <View className="flex-row items-center gap-1.5">
            <Icon className="text-primary" icon={IconAlertTriangle} size={14} />
            <Text className="text-[10px] tracking-widest text-primary" mono weight="semibold">
              PRIORITY
            </Text>
          </View>
          <QuoteCardGrid priority quotes={priorityQuotes} />
        </View>
      ) : null}
      {mainQuotes.length > 0 ? <QuoteCardGrid quotes={mainQuotes} /> : null}
    </View>
  );
}

function QuoteCardGrid({ priority = false, quotes }: { priority?: boolean; quotes: readonly QuoteSummary[] }) {
  const router = useRouter();

  return (
    <BoardGrid
      items={quotes}
      keyOf={(quote) => quote.id}
      minCardWidth={300}
      renderItem={(quote) => (
        <QuoteCard
          onPress={() => router.push({ pathname: '/quotes/[quoteId]', params: { quoteId: quote.id } })}
          priority={priority}
          quote={quote}
        />
      )}
    />
  );
}

function QuoteCard({ quote, priority, onPress }: { quote: QuoteSummary; priority: boolean; onPress: () => void }) {
  const title = quote.kind === 'custom' ? quote.workTitle : (quote.product?.name ?? 'Product unavailable');
  let meta = 'Product unavailable';
  if (quote.kind === 'custom') {
    meta = quoteMetaLine({ kind: 'custom' });
  } else if (quote.product) {
    meta = quoteMetaLine({ kind: 'product', product: quote.product, selectedAssemblies: quote.selectedAssemblies });
  }
  const total = priceQuote(quote).total;
  const salespersonName = quote.salesPersonName ?? 'Not assigned';

  return (
    <Pressable
      accessibilityHint="Opens Quote details"
      accessibilityLabel={`${priority ? 'Priority quote' : 'Quote'} ${quote.code}`}
      accessibilityRole="button"
      className={`rounded-2xl border bg-surface p-4 active:opacity-80 ${priority ? 'border-primary/40' : 'border-border'}`}
      onPress={onPress}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] text-foreground" mono numberOfLines={1} weight="semibold">
            {quote.code}
          </Text>
          <Text className="mt-1 text-[10px] text-muted-foreground" mono>
            {formatDate(quote.createdAt, 'd MMM yyyy')}
          </Text>
        </View>
        <QuoteStatusChip status={quote.status} />
      </View>

      <View className="mt-3.5 flex-row items-center gap-2.5 border-t border-border pt-3.5">
        <Avatar
          className="h-[30px] w-[30px] rounded-lg"
          name={quote.customerCompanyName}
          textClassName="text-[10px]"
          uri={quote.customerThumbnailDataUrl}
        />
        <Text className="min-w-0 flex-1 text-sm text-foreground" numberOfLines={1} weight="semibold">
          {quote.customerCompanyName}
        </Text>
        <View className="rounded-md border border-border bg-muted/50 px-2 py-1">
          <Text className="text-muted-foreground" mono numberOfLines={1} weight="semibold">
            {quote.kind.toUpperCase()}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center gap-2.5">
        {quote.kind === 'product' ? (
          <Avatar
            className="h-[30px] w-[30px] rounded-lg"
            name={title}
            textClassName="text-[10px]"
            uri={quote.product?.thumbnailDataUrl}
          />
        ) : null}
        <View className="min-w-0 flex-1">
          <Text className="text-sm text-foreground" numberOfLines={1} weight="semibold">
            {title}
          </Text>
          <Text className="mt-1 text-[10px] text-muted-foreground" mono numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </View>

      <View className="mt-3.5 flex-row items-center justify-between gap-3 border-t border-border pt-3.5">
        <Text className="min-w-0 flex-1 text-[17px] text-primary" numberOfLines={1} weight="bold">
          {formatCurrency(total, quote.quotedCurrencyCode)}
        </Text>
        <View className="flex-row items-center gap-2">
          {quote.job ? (
            <View className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1">
              <Text className="text-[9px] text-primary" mono weight="semibold">
                {quote.job.jobCode}
              </Text>
            </View>
          ) : null}
          <Avatar
            className="h-6 w-6 rounded-full"
            name={salespersonName}
            textClassName="text-[8px]"
            uri={quote.salesPersonThumbnailDataUrl}
          />
        </View>
      </View>
    </Pressable>
  );
}

export function QuoteGridSkeleton() {
  return (
    <BoardGrid
      items={QUOTE_SKELETON_KEYS}
      keyOf={(key) => key}
      minCardWidth={300}
      renderItem={() => (
        <View className="rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row justify-between gap-4">
            <Pulse className="h-5 w-28 rounded" />
            <Pulse className="h-6 w-20 rounded-full" />
          </View>
          <Pulse className="mt-4 h-10 w-full rounded-lg" />
          <Pulse className="mt-3 h-10 w-4/5 rounded" />
          <Pulse className="mt-4 h-8 w-full rounded" />
        </View>
      )}
    />
  );
}
