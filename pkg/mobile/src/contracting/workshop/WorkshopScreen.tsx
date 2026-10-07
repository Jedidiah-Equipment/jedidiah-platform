import { formatNumber } from '@pkg/domain';
import {
  breakdownStatusColorClassNames,
  breakdownStatusLabels,
  breakdownUrgencyColorClassNames,
  breakdownUrgencyLabels,
} from '@pkg/domain/contracting';
import { type BreakdownStatus, type BreakdownSummary, unsolvedBreakdownStatuses } from '@pkg/schema/contracting';
import { IconFilter } from '@tabler/icons-react-native';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateText } from '@/components/DateText';
import { type ListControlOption, ListControlRow, ListDropdownControl } from '@/components/ListControls';
import { PaginatedList } from '@/components/PaginatedList';
import { MainToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { CategoryIcon } from '@/contracting/components/CategoryIcon';
import { useSessionPermission } from '@/lib/auth-session';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { useBreakdownList, useBreakdownScope } from './use-breakdowns';

type StatusFilter = 'unsolved' | BreakdownStatus;

const STATUS_OPTIONS: readonly ListControlOption<StatusFilter>[] = [
  { label: 'Open or In Progress', value: 'unsolved' },
  { label: breakdownStatusLabels.open, value: 'open' },
  { label: breakdownStatusLabels['in-progress'], value: 'in-progress' },
  { label: breakdownStatusLabels.solved, value: 'solved' },
];

const statusesFor = (filter: StatusFilter): BreakdownStatus[] =>
  filter === 'unsolved' ? [...unsolvedBreakdownStatuses] : [filter];

export default function WorkshopScreen() {
  const scope = useBreakdownScope();
  const canReport = useSessionPermission('contracting_breakdown:report');
  const refresh = useGlobalRefresh();
  const [status, setStatus] = useState<StatusFilter>('unsolved');
  const list = useBreakdownList(statusesFor(status));
  const breakdowns = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar title="Workshop" subtitle="CONTRACTING" helpTopic="contractingMobileWorkshop" />
      <PaginatedList
        header={
          <View className="gap-3">
            {canReport ? (
              <Button
                primary
                title="Report a problem"
                onPress={() => router.push('/contracting/workshop/report' as Href)}
              />
            ) : null}
            <ListControlRow
              leading={
                <Text className="text-lg text-foreground" weight="bold">
                  {scope === 'own' ? 'Your reports' : 'Breakdowns'}
                </Text>
              }
              trailing={
                <ListDropdownControl
                  accessibilityLabel="Filter Breakdowns by status"
                  defaultValue="unsolved"
                  dismissLabel="Dismiss Breakdown status filter"
                  icon={IconFilter}
                  menuWidth={240}
                  onChange={setStatus}
                  options={STATUS_OPTIONS}
                  value={status}
                />
              }
            />
          </View>
        }
        sections={[{ key: 'breakdowns', data: breakdowns }]}
        keyOf={(breakdown) => breakdown.id}
        renderItem={(breakdown) => <BreakdownRow breakdown={breakdown} />}
        initialLoading={scope !== null && list.isPending}
        loadingContent={<Text className="text-muted-foreground">Loading Breakdowns…</Text>}
        emptyContent={
          <Text className="text-muted-foreground">
            {scope === null
              ? 'Your role cannot view Breakdowns.'
              : list.isError
                ? 'Unable to load Breakdowns. Pull to retry.'
                : status === 'unsolved'
                  ? 'No open Breakdowns.'
                  : 'No Breakdowns match this status.'}
          </Text>
        }
        hasNextPage={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        loadingMoreLabel="Loading more Breakdowns…"
        onLoadMore={() => void list.fetchNextPage()}
        refreshing={refresh.refreshing}
        onRefresh={refresh.onRefresh}
      />
    </SafeAreaView>
  );
}

export function BreakdownRow({ breakdown }: { breakdown: BreakdownSummary }) {
  const { subject } = breakdown;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/contracting/workshop/[breakdownId]', params: { breakdownId: breakdown.id } })
      }
      className="w-full gap-2 rounded-xl border border-border bg-surface p-4"
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <CategoryIcon icon={subject.categoryIcon} colour={subject.categoryColour} size={20} />
          <Text className="min-w-0 flex-1 text-lg text-foreground" weight="bold" numberOfLines={1}>
            {subject.code}
          </Text>
        </View>
        <View className="shrink-0 flex-row gap-1">
          <StatusBadge
            classNames={breakdownUrgencyColorClassNames[breakdown.urgency]}
            label={breakdownUrgencyLabels[breakdown.urgency]}
          />
          <StatusBadge
            classNames={breakdownStatusColorClassNames[breakdown.status]}
            label={breakdownStatusLabels[breakdown.status]}
          />
        </View>
      </View>
      <Text className="text-foreground" numberOfLines={2}>
        {breakdown.firstLine}
      </Text>
      <Text className="text-sm text-muted-foreground">
        <DateText className="text-sm text-muted-foreground" date={breakdown.reportedAt} format="medium" /> ·{' '}
        {breakdown.reporterName}
        {breakdown.mechanicName ? ` · ${breakdown.mechanicName}` : ''}
      </Text>
      {breakdown.sameJobOpenCount > 0 ? (
        <Text className="text-sm text-foreground" weight="semibold">
          +{formatNumber(breakdown.sameJobOpenCount)} open on this Job
        </Text>
      ) : null}
    </Pressable>
  );
}
