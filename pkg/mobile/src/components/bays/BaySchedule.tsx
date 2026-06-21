import { formatDate } from '@pkg/domain';
import type { BayOperator } from '@pkg/schema';
import { IconChevronRight } from '@tabler/icons-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { SlotDetailPane } from '@/components/bays/SlotDetailPane';
import { ScheduleHeader } from '@/components/ScheduleHeader';
import { Icon } from '@/components/ui/icon';
import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';
import {
  type BayScheduleActiveJob,
  type BayScheduleState,
  type BayScheduleUpcomingSlot,
  useBaySchedule,
} from '@/lib/use-bay-schedule';

/** Tablet breakpoint: at/above this width the list and detail panes sit side by side. */
const WIDE_BREAKPOINT = 760;

/**
 * A Bay's schedule as one responsive master–detail screen: the shared top bar
 * over the ACTIVE NOW + UP NEXT list pane and the Job Slot detail pane. Wide
 * (≥760px) shows them side by side; narrow pushes the detail over the list and
 * back returns to it. Owns the loading, empty, error, and bay-not-found states.
 */
export function BaySchedule({ bayId, onBack }: { bayId: string; onBack: () => void }) {
  const state = useBaySchedule(bayId);
  const isWide = useWindowDimensions().width >= WIDE_BREAKPOINT;

  if (state.status === 'pending') {
    return (
      <Frame onBack={onBack} operator={null} title="Bay schedule">
        <ScheduleSkeleton />
      </Frame>
    );
  }

  if (state.status === 'error') {
    return (
      <Frame onBack={onBack} operator={null} title="Bay schedule">
        <Text className="text-sm text-danger" weight="semibold">
          Couldn’t load this bay’s schedule.
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">Go back and try again, or check your connection.</Text>
      </Frame>
    );
  }

  if (state.status === 'not-found') {
    return (
      <Frame onBack={onBack} operator={null} title="Bay schedule">
        <Text className="text-sm text-foreground" weight="semibold">
          Bay not found.
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">It may have been disabled or removed.</Text>
      </Frame>
    );
  }

  return <Ready isWide={isWide} onBack={onBack} state={state} />;
}

function Ready({
  state,
  isWide,
  onBack,
}: {
  state: Extract<BayScheduleState, { status: 'ready' }>;
  isWide: boolean;
  onBack: () => void;
}) {
  const { bay, slotsById } = state;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Narrow only: which pane is on top. Wide shows both regardless.
  const [detailOpen, setDetailOpen] = useState(false);

  // Default selection follows the prototype: the active Job, else the soonest Slot.
  // Derived (not stored) so a schedule refetch or bayId change that drops the picked
  // Slot falls back to the default instead of stranding the detail pane on a stale id.
  const defaultId = state.active?.slotId ?? state.upcoming.at(0)?.slotId ?? null;
  const effectiveId = selectedId && slotsById[selectedId] ? selectedId : defaultId;
  const selected = effectiveId ? (slotsById[effectiveId] ?? null) : null;

  const select = (slotId: string) => {
    setSelectedId(slotId);
    if (!isWide) setDetailOpen(true);
  };
  const handleBack = () => {
    if (!isWide && detailOpen) setDetailOpen(false);
    else onBack();
  };

  const showList = isWide || !detailOpen;
  const showDetail = isWide || detailOpen;
  const onDetail = !isWide && detailOpen;

  return (
    <>
      <ScheduleHeader
        onBack={handleBack}
        operator={bay.operator}
        subtitle={onDetail ? 'Job slot' : 'Bay schedule'}
        title={onDetail && selected ? selected.jobCode : bay.name}
      />
      <View className="flex-1 flex-row">
        {showList ? (
          <ScrollView
            className="border-border"
            contentContainerClassName="mx-auto w-full max-w-[640px] px-4 pb-10 pt-4"
            style={isWide ? { flex: 2, borderRightWidth: 1 } : { flex: 1 }}
          >
            <ListPane onSelect={select} selectedId={effectiveId} state={state} />
          </ScrollView>
        ) : null}
        {showDetail ? (
          <ScrollView
            contentContainerClassName="w-full max-w-[680px] px-4 pb-10 pt-4"
            style={isWide ? { flex: 3 } : { flex: 1 }}
          >
            {selected ? (
              <SlotDetailPane slot={selected} />
            ) : (
              <View className="rounded-2xl border border-dashed border-border px-4 py-10">
                <Text className="text-center text-sm text-muted-foreground">Select a slot to see its details.</Text>
              </View>
            )}
          </ScrollView>
        ) : null}
      </View>
    </>
  );
}

function ListPane({
  state,
  selectedId,
  onSelect,
}: {
  state: Extract<BayScheduleState, { status: 'ready' }>;
  selectedId: string | null;
  onSelect: (slotId: string) => void;
}) {
  const { active, upcoming } = state;
  const isEmpty = !active && upcoming.length === 0;

  if (isEmpty) {
    return (
      <View className="rounded-2xl border border-dashed border-border px-4 py-10">
        <Text className="text-center text-sm text-foreground" weight="semibold">
          No jobs scheduled
        </Text>
        <Text className="mt-1 text-center text-sm text-muted-foreground">This bay has no active or upcoming work.</Text>
      </View>
    );
  }

  return (
    <>
      <SectionLabel className="mb-2.5">ACTIVE NOW</SectionLabel>
      {active ? (
        <ActiveHero active={active} onSelect={() => onSelect(active.slotId)} selected={selectedId === active.slotId} />
      ) : (
        <View className="rounded-2xl border border-dashed border-border px-4 py-6">
          <Text className="text-sm text-muted-foreground" weight="semibold">
            No active job
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">Nothing running today.</Text>
        </View>
      )}

      {upcoming.length > 0 ? (
        <>
          <SectionLabel className="mb-3 mt-6">UP NEXT</SectionLabel>
          <Timeline onSelect={onSelect} selectedId={selectedId} slots={upcoming} />
        </>
      ) : null}
    </>
  );
}

function ActiveHero({
  active,
  selected,
  onSelect,
}: {
  active: BayScheduleActiveJob;
  selected: boolean;
  onSelect: () => void;
}) {
  const heroSub = [active.productSerialNumber, active.customerCompanyName].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-2xl border bg-surface p-4 active:opacity-90 ${
        selected ? 'border-primary' : 'border-status-in-progress/50'
      }`}
      onPress={onSelect}
    >
      <View className="flex-row items-start gap-3.5">
        <Avatar
          className="h-[52px] w-[52px] rounded-xl"
          name={active.productName}
          uri={active.productThumbnailDataUrl}
        />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full bg-status-in-progress" />
            <Text className="text-[10px] tracking-wide text-status-in-progress" weight="semibold">
              IN PROGRESS
            </Text>
          </View>
          <Text className="mt-1 text-xl text-surface-foreground" mono weight="bold">
            {active.jobCode}
          </Text>
          <Text className="mt-0.5 text-sm text-surface-foreground" numberOfLines={1}>
            {active.productName}
          </Text>
          {heroSub ? (
            <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
              {heroSub}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="my-4 h-px bg-border" />

      <View className="flex-row items-end justify-between">
        <View className="flex-row items-baseline gap-2">
          <Text className="text-5xl leading-[48px] text-foreground" weight="bold">
            {active.remainingWorkDays}
          </Text>
          <Text className="text-sm text-muted-foreground" weight="semibold">
            days left
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">ends</Text>
          <Text className="text-xs text-surface-foreground" weight="semibold">
            {formatDate(active.lastWorkDay, 'EEE d MMM')}
          </Text>
        </View>
      </View>

      <View className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <View className="h-full rounded-full bg-status-in-progress" style={{ width: `${active.progressPercent}%` }} />
      </View>
      <View className="mt-2 flex-row justify-between">
        <Text className="text-[10px] text-muted-foreground">{formatDate(active.startDate, 'd MMM')}</Text>
        <Text className="text-[10px] text-muted-foreground">
          {active.elapsedWorkDays} of {active.totalWorkDays} work days
        </Text>
      </View>
    </Pressable>
  );
}

function Timeline({
  slots,
  selectedId,
  onSelect,
}: {
  slots: BayScheduleUpcomingSlot[];
  selectedId: string | null;
  onSelect: (slotId: string) => void;
}) {
  return (
    <View className="relative pl-6">
      {/* Vertical spine the Slot nodes sit on. */}
      <View className="absolute bottom-2 left-1.5 top-2 w-0.5 bg-border" />
      {slots.map((slot) => (
        <TimelineItem
          key={slot.slotId}
          onSelect={() => onSelect(slot.slotId)}
          selected={selectedId === slot.slotId}
          slot={slot}
        />
      ))}
    </View>
  );
}

function TimelineItem({
  slot,
  selected,
  onSelect,
}: {
  slot: BayScheduleUpcomingSlot;
  selected: boolean;
  onSelect: () => void;
}) {
  const rangeLabel =
    `${formatDate(slot.startDate, 'd MMM')} – ${formatDate(slot.lastWorkDay, 'd MMM')} · ${slot.workDays} work ${
      slot.workDays === 1 ? 'day' : 'days'
    }`.toUpperCase();
  const labelClass = selected ? 'text-primary' : slot.isNext ? 'text-status-next-soft' : 'text-muted-foreground';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="relative mb-3"
      onPress={onSelect}
    >
      {/* Node on the spine — solid for 'next', muted otherwise. */}
      <View
        className={`absolute top-4 h-3.5 w-3.5 rounded-full border-2 bg-background ${
          slot.isNext ? 'border-status-next' : 'border-muted-foreground'
        }`}
        style={{ left: -24 }}
      />
      <View
        className={`rounded-2xl border bg-surface p-3.5 active:opacity-90 ${
          selected ? 'border-primary' : slot.isNext ? 'border-status-next/50' : 'border-border'
        }`}
      >
        <Text className={`text-[10px] tracking-wide ${labelClass}`} weight="semibold">
          {rangeLabel}
        </Text>
        <View className="mt-2.5 flex-row items-center gap-3">
          <Avatar className="h-10 w-10 rounded-lg" name={slot.productName} uri={slot.productThumbnailDataUrl} />
          <View className="min-w-0 flex-1">
            <Text className="text-sm text-surface-foreground" mono weight="semibold">
              {slot.jobCode}
            </Text>
            <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
              {slot.productName}
            </Text>
          </View>
          <Icon className="text-muted-foreground" icon={IconChevronRight} size={18} />
        </View>
      </View>
    </Pressable>
  );
}

function SectionLabel({ children, className = '' }: { children: string; className?: string }) {
  return (
    <Text className={`text-[11px] uppercase tracking-widest text-muted-foreground ${className}`} weight="semibold">
      {children}
    </Text>
  );
}

function Frame({
  title,
  operator,
  onBack,
  children,
}: {
  title: string;
  operator: BayOperator | null;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <ScheduleHeader onBack={onBack} operator={operator} title={title} />
      <ScrollView contentContainerClassName="mx-auto w-full max-w-[640px] px-4 pb-10 pt-4">{children}</ScrollView>
    </>
  );
}

function ScheduleSkeleton() {
  return (
    <View>
      <Pulse className="mb-2.5 h-3 w-24 rounded" />
      <View className="rounded-2xl border border-border bg-surface p-4">
        <View className="flex-row gap-3.5">
          <Pulse className="h-[52px] w-[52px] rounded-xl" />
          <View className="flex-1 gap-2">
            <Pulse className="h-2.5 w-20 rounded" />
            <Pulse className="h-5 w-28 rounded" />
            <Pulse className="h-3 w-2/3 rounded" />
          </View>
        </View>
        <Pulse className="mt-4 h-12 w-32 rounded" />
        <Pulse className="mt-4 h-1.5 w-full rounded-full" />
      </View>
      <Pulse className="mb-3 mt-6 h-3 w-20 rounded" />
      {['a', 'b'].map((key) => (
        <View className="mb-3 rounded-2xl border border-border bg-surface p-3.5" key={key}>
          <Pulse className="h-2.5 w-40 rounded" />
          <View className="mt-2.5 flex-row items-center gap-3">
            <Pulse className="h-10 w-10 rounded-lg" />
            <View className="flex-1 gap-1.5">
              <Pulse className="h-3.5 w-24 rounded" />
              <Pulse className="h-2.5 w-32 rounded" />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
