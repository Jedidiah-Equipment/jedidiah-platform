import {
  formatDate,
  type JobProgress,
  type JobRouteStopState,
  restingStatusColor,
  statusDaysLeftColor,
} from '@pkg/domain';
import type { ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { JobAssemblies } from '@/components/bays/JobAssemblies';
import { JobDocuments } from '@/components/bays/JobDocuments';
import { FactCard, JobFactsCard } from '@/components/bays/job-facts';
import { DaysLeftChip, STATUS_TONE, StatusChip, type StatusTone } from '@/components/bays/status-chip';
import { GiveFeedbackButton } from '@/components/feedback/GiveFeedbackButton';
import { JobFeedbackList } from '@/components/feedback/JobFeedbackList';
import { ScheduleHeader } from '@/components/ScheduleHeader';
import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';
import { type JobDetailState, type JobRouteStopCard, useJobDetail } from '@/lib/use-job-detail';
import { useColorMode } from '@/theme/use-color-mode';

type ReadyState = Extract<JobDetailState, { status: 'ready' }>;

/** Tablet breakpoint: at/above this width the route and detail panes sit side by side. */
const WIDE_BREAKPOINT = 760;

/**
 * Job Detail as one responsive master–detail screen (#615): the production-route timeline (every
 * Bay the Job touches, in department-pipeline order) and the detail pane (product, overall progress,
 * documents, Job facts). Wide (≥760px) shows them side by side with the route on the left; narrow
 * stacks the detail over the route. Days-left + overall progress come from the shared Job projection,
 * so they match the Job List card. Owns the loading, forbidden, error, and not-found states.
 */
export function JobDetail({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const state = useJobDetail(jobId);
  const isWide = useWindowDimensions().width >= WIDE_BREAKPOINT;

  if (state.status === 'pending') {
    return (
      <Frame onBack={onBack}>
        <DetailSkeleton />
      </Frame>
    );
  }

  if (state.status === 'forbidden') {
    return (
      <Frame onBack={onBack}>
        <Text className="text-sm text-foreground" weight="semibold">
          You don’t have access to this Job.
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Your account doesn’t have Job access. Ask an administrator to update your permissions.
        </Text>
      </Frame>
    );
  }

  if (state.status === 'error') {
    return (
      <Frame onBack={onBack}>
        <Text className="text-sm text-danger" weight="semibold">
          Couldn’t load this Job.
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">Go back and try again, or check your connection.</Text>
      </Frame>
    );
  }

  if (state.status === 'not-found') {
    return (
      <Frame onBack={onBack}>
        <Text className="text-sm text-foreground" weight="semibold">
          Job not on the shop floor.
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">It has no scheduled work, or its Bays were retired.</Text>
      </Frame>
    );
  }

  return <Ready isWide={isWide} jobId={jobId} onBack={onBack} state={state} />;
}

function Ready({
  state,
  jobId,
  isWide,
  onBack,
}: {
  state: ReadyState;
  jobId: string;
  isWide: boolean;
  onBack: () => void;
}) {
  const header = (
    <ScheduleHeader
      onBack={onBack}
      operator={null}
      showOperatorAvatar={false}
      subtitle={state.jobDisplayName}
      title={state.jobCode}
      titleMono
    />
  );

  if (isWide) {
    return (
      <>
        {header}
        <View className="flex-1 flex-row">
          <ScrollView
            className="border-border"
            contentContainerClassName="w-full px-4 pb-10 pt-4"
            style={{ borderRightWidth: 1, flex: 42 }}
          >
            <RoutePane route={state.route} />
          </ScrollView>
          <ScrollView contentContainerClassName="w-full px-4 pb-10 pt-4" style={{ flex: 58 }}>
            <DetailPane jobId={jobId} state={state} />
          </ScrollView>
        </View>
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView contentContainerClassName="w-full px-4 pb-10 pt-4">
        <DetailPane jobId={jobId} state={state} />
        <View className="my-5 h-px bg-border" />
        <RoutePane route={state.route} />
      </ScrollView>
    </>
  );
}

/** Route state → shared status tone, so the timeline reuses the board's chip/label/bar accents. */
const ROUTE_STATE_TONE: Record<JobRouteStopState, StatusTone> = {
  active: 'in-progress',
  done: 'muted',
  scheduled: 'next',
};

/** Timeline-only decorations (the soft card, the spine node, the border-only chip) keyed by state. */
const ROUTE_DECOR: Record<JobRouteStopState, { card: string; chip: string; node: string }> = {
  active: {
    card: 'border-status-in-progress/30 bg-status-in-progress/10',
    chip: 'border-status-in-progress/30',
    node: 'border-status-in-progress bg-status-in-progress',
  },
  scheduled: {
    card: 'border-status-next/30 bg-status-next/10',
    chip: 'border-status-next/30',
    node: 'border-status-next bg-background',
  },
  done: {
    card: 'border-border bg-surface',
    chip: 'border-border',
    node: 'border-muted-foreground bg-muted-foreground',
  },
};

const STATE_LABELS = { active: 'IN PROGRESS', done: 'DONE', scheduled: 'SCHEDULED' } as const;

/** Left pane: the Job's Bays as a vertical timeline, each with its state, dates, and progress. */
function RoutePane({ route }: { route: JobRouteStopCard[] }) {
  return (
    <View>
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-[11px] uppercase tracking-widest text-muted-foreground" weight="semibold">
          Production route
        </Text>
        <Text className="text-[10px] tracking-wide text-muted-foreground" mono>
          {route.length} {route.length === 1 ? 'bay' : 'bays'}
        </Text>
      </View>
      <View className="relative">
        {/* Vertical spine the Bay nodes sit on. The gutter comes from each stop's card margin
            (below), not container padding, so the spine and nodes share the same x=0 origin —
            RN applies parent padding to absolute children, which would offset them. */}
        <View className="absolute bottom-2 left-1.5 top-2 w-0.5 bg-border" />
        {route.map((stop) => (
          <RouteStop key={stop.slotId} stop={stop} />
        ))}
      </View>
    </View>
  );
}

function RouteStop({ stop }: { stop: JobRouteStopCard }) {
  const tone = STATUS_TONE[ROUTE_STATE_TONE[stop.state]];
  const decor = ROUTE_DECOR[stop.state];
  const operatorName = stop.operator?.name ?? 'No operator';

  return (
    <View className="relative mb-3.5">
      <View className={`absolute top-4 h-3.5 w-3.5 rounded-full border-2 ${decor.node}`} style={{ left: 0 }} />
      {/* Indent past the spine/node gutter (replaces the old container padding). */}
      <View className={`rounded-2xl border p-3.5 ${decor.card}`} style={{ marginLeft: 28 }}>
        <View className="flex-row items-start justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
            <Avatar
              className="h-9 w-9 rounded-lg"
              name={stop.operator?.name ?? 'Unassigned'}
              uri={stop.operator?.thumbnailDataUrl}
            />
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] text-surface-foreground" numberOfLines={1} weight="bold">
                {operatorName}
              </Text>
              <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
                {stop.bayName}
              </Text>
            </View>
          </View>
          <View className={`rounded-full border px-2 py-1 ${decor.chip}`}>
            <Text className={`text-[9px] tracking-wide ${tone.text}`} weight="semibold">
              {STATE_LABELS[stop.state]}
            </Text>
          </View>
        </View>

        <View className="mt-3 flex-row items-center justify-between">
          <Text className="text-[10px] text-muted-foreground" mono>
            {formatDate(stop.startDate, 'd MMM')} – {formatDate(stop.lastWorkDay, 'd MMM')}
          </Text>
          <Text className={`text-[10px] ${tone.text}`} mono>
            {routeDaysLabel(stop)}
          </Text>
        </View>

        <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <View className={`h-full rounded-full ${tone.dot}`} style={{ width: `${stop.progressPercent}%` }} />
        </View>
      </View>
    </View>
  );
}

function routeDaysLabel(stop: JobRouteStopCard): string {
  if (stop.state === 'done') return 'Completed';
  if (stop.state === 'active') {
    return `${stop.remainingWorkDays} ${stop.remainingWorkDays === 1 ? 'working day' : 'working days'} left`;
  }

  return `Starts ${formatDate(stop.startDate, 'd MMM')}`;
}

/** Right pane: status chips, work card, overall progress, documents, and the Job facts grid. */
function DetailPane({ jobId, state }: { jobId: string; state: ReadyState }) {
  const { progress } = state;
  const { resolved } = useColorMode();
  const overallPercent = progress?.overallPercent ?? 100;
  // The working-days-left chip + overall bar share the status accent: blue in progress, green when
  // queued, amber/red as the finish nears. A finished Job (null progress) rests on the scheduled green.
  const accent = progress
    ? statusDaysLeftColor({ status: progress.status, daysLeft: progress.daysLeft, scheme: resolved })
    : restingStatusColor('scheduled', resolved);
  const status = jobStatus(progress);

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusChip label={status.label} tone={status.tone} />
        {progress ? <DaysLeftChip color={accent} daysLeft={progress.daysLeft} /> : null}
      </View>

      <View className="flex-row items-center gap-3.5 rounded-2xl border border-border bg-surface p-3.5">
        <Avatar
          className="h-[52px] w-[52px] rounded-xl"
          name={state.jobDisplayName}
          uri={state.productThumbnailDataUrl}
        />
        <View className="min-w-0 flex-1">
          <Text className="text-base text-surface-foreground" numberOfLines={1} weight="bold">
            {state.jobDisplayName}
          </Text>
          {state.productSerialNumber ? (
            <Text className="mt-0.5 text-xs text-muted-foreground" mono>
              {state.productSerialNumber}
            </Text>
          ) : null}
          {state.customerCompanyName ? (
            <Text className="mt-1 text-sm text-surface-foreground" numberOfLines={1}>
              {state.customerCompanyName}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="rounded-2xl border border-border bg-surface p-4">
        <View className="mb-2.5 flex-row items-center justify-between">
          <Text className="text-[11px] uppercase tracking-widest text-muted-foreground" weight="semibold">
            Overall progress
          </Text>
          <Text className="text-[11px] text-surface-foreground" mono>
            {overallPercent}%
          </Text>
        </View>
        <View className="h-1.5 overflow-hidden rounded-full bg-muted">
          <View className="h-full rounded-full" style={{ backgroundColor: accent, width: `${overallPercent}%` }} />
        </View>
        <Text className="mt-2 text-[10px] text-muted-foreground" mono>
          {state.doneCount} of {state.totalCount} bays complete
        </Text>
      </View>

      {state.description ? (
        <FactCard title="Description">
          <Text className="text-sm leading-5 text-surface-foreground">{state.description}</Text>
        </FactCard>
      ) : null}

      <JobDocuments jobId={jobId} />

      <JobAssemblies jobId={jobId} />

      <JobFactsCard
        customerCompanyName={state.customerCompanyName}
        jobCode={state.jobCode}
        workName={state.jobDisplayName}
        productSerialNumber={state.productSerialNumber}
        quoteCode={state.quoteCode}
      />

      <JobFeedbackList jobId={jobId} />

      <GiveFeedbackButton jobCode={state.jobCode} jobId={jobId} />
    </View>
  );
}

function jobStatus(progress: JobProgress | null): { tone: StatusTone; label: string } {
  if (!progress) return { tone: 'muted', label: 'COMPLETE' };
  if (progress.status === 'in-progress') {
    return { tone: 'in-progress', label: `IN ${progress.currentBayName.toUpperCase()}` };
  }

  return { tone: 'next', label: `NEXT · ${progress.currentBayName.toUpperCase()}` };
}

/** Header + a single scroll for the non-ready states, mirroring the Bay schedule screen. */
function Frame({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return (
    <>
      <ScheduleHeader onBack={onBack} operator={null} showOperatorAvatar={false} title="Job detail" />
      <ScrollView contentContainerClassName="w-full px-4 pb-10 pt-4">{children}</ScrollView>
    </>
  );
}

function DetailSkeleton() {
  return (
    <View className="gap-4">
      <Pulse className="h-6 w-28 rounded-full" />
      <View className="rounded-2xl border border-border bg-surface p-3.5">
        <View className="flex-row items-center gap-3.5">
          <Pulse className="h-[52px] w-[52px] rounded-xl" />
          <View className="flex-1 gap-2">
            <Pulse className="h-4 w-2/3 rounded" />
            <Pulse className="h-2.5 w-1/2 rounded" />
          </View>
        </View>
      </View>
      <View className="rounded-2xl border border-border bg-surface p-4">
        <Pulse className="h-2.5 w-28 rounded" />
        <Pulse className="mt-3 h-1.5 w-full rounded-full" />
      </View>
      {['a', 'b'].map((key) => (
        <Pulse className="h-20 w-full rounded-2xl" key={key} />
      ))}
    </View>
  );
}
