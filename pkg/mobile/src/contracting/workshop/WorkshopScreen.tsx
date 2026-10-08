import { IconFilter, IconUser } from '@tabler/icons-react-native';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type ListControlOption,
  ListControlRow,
  ListCreateControl,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { infiniteQueryPagination, TabRootList } from '@/components/TabRootList';
import { MainToolbar } from '@/components/TopToolbar';
import { Text } from '@/components/ui/text';
import { contractingStorageKey } from '@/contracting/lib/contracting-storage';
import { useSessionPermission } from '@/lib/auth-session';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { usePersistedState } from '@/lib/use-persisted-state';
import { BreakdownRow } from './BreakdownRow';
import { isStatusFilter, type StatusFilter, statusesFor, statusOptions } from './breakdown-status-filter';
import { useBreakdownList, useBreakdownScope, useBreakdownStatusCounts, useMechanics } from './use-breakdowns';

const STATUS_KEY = contractingStorageKey('workshop', 'status');
const EVERY_MECHANIC = 'all';

export default function WorkshopScreen() {
  const scope = useBreakdownScope();
  const canReport = useSessionPermission('contracting_breakdown:report');
  const counts = useBreakdownStatusCounts();
  const mechanics = useMechanics();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);
  const [status, setStatus] = usePersistedState<StatusFilter>(STATUS_KEY, 'unsolved', isStatusFilter);
  const [mechanic, setMechanic] = useState(EVERY_MECHANIC);
  const list = useBreakdownList({
    search: debouncedSearch,
    statuses: statusesFor(status),
    mechanicUserIds: mechanic === EVERY_MECHANIC ? [] : [mechanic],
  });
  const breakdowns = list.data?.pages.flatMap((page) => page.items) ?? [];
  const mechanicOptions: ListControlOption<string>[] = [
    { label: 'All mechanics', value: EVERY_MECHANIC },
    ...(mechanics.data ?? []).map((person) => ({ label: person.name, value: person.id })),
  ];
  const filtered = search !== '' || status !== 'unsolved' || mechanic !== EVERY_MECHANIC;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar title="Workshop" subtitle="CONTRACTING" helpTopic="contractingMobileWorkshop" />
      <TabRootList
        header={
          <ListControlRow
            leading={
              <ListSearchControl
                accessibilityLabel="Search Breakdowns"
                onChangeText={setSearch}
                placeholder="Search by machine, Job, or problem…"
                value={search}
              />
            }
            trailing={
              <View className="flex-row items-center gap-2">
                <ListDropdownControl
                  accessibilityLabel="Filter Breakdowns by status"
                  defaultValue="unsolved"
                  dismissLabel="Dismiss Breakdown status filter"
                  icon={IconFilter}
                  menuWidth={240}
                  onChange={setStatus}
                  options={statusOptions(counts.data)}
                  value={status}
                />
                {mechanics.data ? (
                  <ListDropdownControl
                    accessibilityLabel="Filter Breakdowns by Mechanic"
                    defaultValue={EVERY_MECHANIC}
                    dismissLabel="Dismiss Mechanic filter"
                    icon={IconUser}
                    menuWidth={240}
                    onChange={setMechanic}
                    options={mechanicOptions}
                    value={mechanic}
                  />
                ) : null}
                {canReport ? (
                  <ListCreateControl
                    label="Report a problem"
                    onPress={() => router.push('/contracting/workshop/report' as Href)}
                  />
                ) : null}
              </View>
            }
          />
        }
        sections={[{ key: 'breakdowns', data: breakdowns }]}
        keyOf={(breakdown) => breakdown.id}
        pagination={infiniteQueryPagination(list, 'Loading more Breakdowns…')}
        renderItem={(breakdown) => <BreakdownRow breakdown={breakdown} />}
        initialLoading={scope !== null && list.isPending}
        loadingContent={<Text className="text-muted-foreground">Loading Breakdowns…</Text>}
        emptyContent={
          <Text className="text-muted-foreground">
            {scope === null
              ? 'Your role cannot view Breakdowns.'
              : list.isError
                ? 'Unable to load Breakdowns. Pull to retry.'
                : filtered
                  ? 'No Breakdowns match your search or filters.'
                  : scope === 'own'
                    ? 'Nothing you reported is waiting to be fixed.'
                    : 'Nothing is waiting to be fixed.'}
          </Text>
        }
      />
    </SafeAreaView>
  );
}
