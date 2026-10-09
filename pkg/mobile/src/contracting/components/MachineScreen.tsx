import { formatDate, formatHours } from '@pkg/domain';
import {
  MISSING_PHOTO_EVIDENCE,
  readingRoleLabels,
  serviceDueStatusColorClassNames,
  serviceDueStatusLabels,
} from '@pkg/domain/contracting';
import type { FieldMachine, FieldReading } from '@pkg/schema/contracting';
import { IconGauge } from '@tabler/icons-react-native';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateText } from '@/components/DateText';
import { SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { SubTabControl, type SubTabOption } from '@/components/SubTabControl';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { RefreshControl } from '@/components/ui/refresh-control';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { useCanReadJobs } from '@/contracting/jobs/use-jobs';
import { contractingStorageKey } from '@/contracting/lib/contracting-storage';
import { useFleet, useMachineReadingPages } from '@/contracting/readings/use-fleet';
import { BreakdownRow } from '@/contracting/workshop/BreakdownRow';
import { useMachineBreakdowns } from '@/contracting/workshop/use-breakdowns';
import { useSessionPermission } from '@/lib/auth-session';
import { usePersistedState } from '@/lib/use-persisted-state';
import { BreakdownIcon } from './BreakdownSubjectIcons';
import { CategoryIcon } from './CategoryIcon';

type MachineTab = 'details' | 'readings';
const MACHINE_TABS: readonly SubTabOption<MachineTab>[] = [
  { label: 'Details', value: 'details' },
  { label: 'Readings', value: 'readings' },
];
const isMachineTab = (value: unknown): value is MachineTab => value === 'details' || value === 'readings';

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="text-lg text-foreground" weight="bold">
      {children}
    </Text>
  );
}

function ServiceRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className="text-muted-foreground">{label}</Text>
      <Text className={tone ?? 'text-foreground'} weight="semibold">
        {value}
      </Text>
    </View>
  );
}

/** Where the Machine stands against its dash sticker: the due status, the due point, what is left, and the interval. */
function ServiceCard({ machine }: { machine: FieldMachine }) {
  const colours = serviceDueStatusColorClassNames[machine.serviceDueStatus];
  const remaining = machine.hoursToService;
  const flagged = machine.serviceDueStatus === 'due-soon' || machine.serviceDueStatus === 'overdue';
  return (
    <View className="gap-3 rounded-xl border border-border bg-surface p-4">
      <View className="flex-row">
        <StatusBadge classNames={colours} label={serviceDueStatusLabels[machine.serviceDueStatus]} />
      </View>
      <ServiceRow
        label="Next service due"
        value={machine.nextServiceDueHours === null ? 'Not set' : formatHours(machine.nextServiceDueHours)}
      />
      {remaining !== null ? (
        <ServiceRow
          label={remaining < 0 ? 'Overdue by' : 'Hours to go'}
          tone={flagged ? colours.text : undefined}
          value={formatHours(Math.abs(remaining))}
        />
      ) : null}
      <ServiceRow
        label="Service interval"
        value={machine.serviceIntervalHours === null ? 'Not set' : formatHours(machine.serviceIntervalHours)}
      />
    </View>
  );
}

function ReadingCard({ reading }: { reading: FieldReading }) {
  return (
    <View className="gap-1 rounded-xl border border-border bg-surface p-4">
      <Text className="text-foreground" weight="semibold">
        {formatHours(reading.value)} · {readingRoleLabels[reading.role]}
      </Text>
      <Text className="text-sm text-muted-foreground">{formatDate(reading.capturedAt, 'medium')}</Text>
      <Text className="text-sm text-muted-foreground">
        {reading.photoBacked ? 'Photo-backed' : MISSING_PHOTO_EVIDENCE}
        {reading.disputed ? ' · Disputed' : ''}
      </Text>
    </View>
  );
}

/** Every Hour Reading on the Machine, newest first, loading the next server page as the end comes into view. */
function ReadingsTab({ machineId }: { machineId: string }) {
  const { canRead, query, readings } = useMachineReadingPages(machineId);
  const requested = useRef(false);
  useEffect(() => {
    if (!query.isFetchingNextPage) requested.current = false;
  }, [query.isFetchingNextPage]);
  const loadMore = () => {
    if (!query.hasNextPage || query.isFetchingNextPage || query.isPending || requested.current) return;
    // FlatList can fire onEndReached repeatedly before the in-flight page shows on the query.
    requested.current = true;
    void query.fetchNextPage();
  };
  return (
    <FlatList
      className="flex-1"
      contentContainerStyle={SECONDARY_PAGE_CONTENT_STYLE}
      data={readings}
      ItemSeparatorComponent={() => <View className="h-3" />}
      keyExtractor={(reading) => reading.id}
      ListEmptyComponent={
        <Text className="text-muted-foreground">
          {!canRead
            ? 'Your role cannot view readings.'
            : query.isError
              ? 'Readings could not be loaded. Pull to retry.'
              : query.isPending
                ? 'Loading readings…'
                : 'No reading history.'}
        </Text>
      }
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <Text className="pt-3 text-center text-sm text-muted-foreground">Loading more readings…</Text>
        ) : null
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl />}
      renderItem={({ item }) => <ReadingCard reading={item} />}
    />
  );
}

/** The Job the Machine is on site on now, opening that Job like a Breakdown row opens its Breakdown. */
function BusyWithCard({ job, canOpen }: { job: NonNullable<FieldMachine['busyOnJob']>; canOpen: boolean }) {
  const body = (
    <>
      <Text className="text-lg text-foreground" weight="bold" numberOfLines={1}>
        {job.customerName}
      </Text>
      <Text className="text-muted-foreground" numberOfLines={1}>
        {job.farmName} · {job.workTypeName}
      </Text>
      <Text className="text-sm text-muted-foreground">
        On site since <DateText className="text-sm text-muted-foreground" date={job.arrivedAt} format="medium" />
      </Text>
    </>
  );
  const className = 'w-full gap-2 rounded-xl border border-border bg-surface p-4';
  return canOpen ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${job.jobNumber}`}
      onPress={() => router.push(`/contracting/jobs/${job.id}` as Href)}
      className={className}
    >
      {body}
    </Pressable>
  ) : (
    <View className={className}>{body}</View>
  );
}

export default function MachineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fleet = useFleet();
  const machine = fleet.data?.find((row) => row.id === id);
  const canCapture = useSessionPermission('contracting_reading:capture');
  const canReport = useSessionPermission('contracting_breakdown:report');
  const canReadBreakdowns = useSessionPermission('contracting_breakdown:read');
  const breakdowns = useMachineBreakdowns(id);
  const canOpenJobs = useCanReadJobs();
  const [tab, setTab] = usePersistedState<MachineTab>(contractingStorageKey('machine-tab'), 'details', isMachineTab);
  // An API from before busyOnJob sends only the Job Number, which the section then names on its own.
  const busyOnJob = machine?.busyOnJob ?? null;
  const openBreakdowns = canReadBreakdowns ? (breakdowns.data?.items ?? []) : [];
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title="Machine"
        subtitle={machine?.code ?? 'CONTRACTING'}
        parentLabel="Machines"
        onBack={() => router.replace('/contracting/machines' as Href)}
        helpTopic="contractingMobileMachine"
      />
      <View className="border-b border-border px-4 py-3">
        <SubTabControl activeValue={tab} onChange={setTab} tabs={MACHINE_TABS} />
      </View>
      {tab === 'readings' ? (
        <ReadingsTab machineId={id} />
      ) : (
        <ScrollView
          contentContainerStyle={{ ...SECONDARY_PAGE_CONTENT_STYLE, gap: 16 }}
          refreshControl={<RefreshControl />}
        >
          <View className="gap-2 rounded-xl border border-border bg-surface p-4">
            <View className="flex-row items-center gap-3">
              {machine ? <CategoryIcon icon={machine.categoryIcon} colour={machine.categoryColour} size={24} /> : null}
              <Text className="text-lg text-foreground" weight="bold">
                {machine ? `${machine.make} ${machine.model}` : 'Machine details unavailable'}
              </Text>
            </View>
            {machine ? (
              <Text className="text-muted-foreground">
                {machine.categoryName}
                {machine.currentDriverName ? ` · ${machine.currentDriverName}` : ''}
              </Text>
            ) : null}
            <Text className="text-3xl text-foreground" weight="bold">
              {machine?.latestReadingHours != null ? formatHours(machine.latestReadingHours) : 'No known reading'}
            </Text>
            {machine?.latestReadingAt ? (
              <Text className="text-sm text-muted-foreground">
                Read{' '}
                <DateText className="text-sm text-muted-foreground" date={machine.latestReadingAt} format="medium" />
              </Text>
            ) : null}
          </View>
          {canCapture && machine ? (
            <Button
              icon={IconGauge}
              primary
              title="Capture reading"
              onPress={() =>
                router.push({
                  pathname: '/contracting/machines/[id]/capture',
                  params: { id },
                })
              }
            />
          ) : null}
          {canReport && machine ? (
            <Button
              icon={BreakdownIcon}
              title="Report a problem"
              onPress={() =>
                router.push({
                  pathname: '/contracting/workshop/report',
                  params: { subjectKind: 'machine', subjectId: id },
                })
              }
            />
          ) : null}
          {machine ? (
            <>
              <SectionTitle>Service</SectionTitle>
              <ServiceCard machine={machine} />
              {busyOnJob ? (
                <>
                  <SectionTitle>Busy with</SectionTitle>
                  <BusyWithCard canOpen={canOpenJobs} job={busyOnJob} />
                </>
              ) : machine.onSiteJobNumber ? (
                <>
                  <SectionTitle>Busy with</SectionTitle>
                  <Text className="text-muted-foreground">On site on {machine.onSiteJobNumber}.</Text>
                </>
              ) : null}
            </>
          ) : null}
          {openBreakdowns.length ? (
            <>
              <SectionTitle>Breakdowns to fix</SectionTitle>
              {openBreakdowns.map((breakdown) => (
                <BreakdownRow key={breakdown.id} breakdown={breakdown} />
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
