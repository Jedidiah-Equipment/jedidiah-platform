import { formatHours, formatQuantity, getFirstName } from '@pkg/domain';
import {
  type AttentionThresholds,
  assignmentAttentionSentence,
  assignmentStateColorClassNames,
  assignmentStateLabels,
  breakdownsByStint,
  type JobSheetStint,
  jobSheet,
  mostUrgentBreakdown,
  needsALookColorClassNames,
} from '@pkg/domain/contracting';
import type { AssignmentDetail, BreakdownSummary, JobCardVariant } from '@pkg/schema/contracting';
import { IconPencil, IconPlayerPlay, IconPlayerStop, IconPlus, IconRuler2 } from '@tabler/icons-react-native';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { AddNoteButton } from '@/contracting/activity/AddNoteButton';
import { ContractingActivityFeed } from '@/contracting/activity/ContractingActivityFeed';
import { RecordTabBar, useRecordTab } from '@/contracting/activity/RecordTabs';
import { BreakdownFlagButton, BreakdownIcon, breakdownBorder } from '@/contracting/components/BreakdownSubjectIcons';
import { CaptureButton } from '@/contracting/components/CaptureButton';
import { CategoryIcon, categoryTileSize } from '@/contracting/components/CategoryIcon';
import { jobCardShareAction } from '@/contracting/lib/job-card';
import { useJobBreakdowns } from '@/contracting/workshop/use-breakdowns';
import { shareDocument } from '@/lib/document-actions';
import { useBusyAction } from '@/lib/use-busy-action';
import { useColorMode } from '@/theme/use-color-mode';
import { JobStatusChip } from './JobStatusChip';
import { MeasuresSheet } from './MeasuresSheet';
import { useJob } from './use-jobs';

export default function JobScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const jobQuery = useJob(jobId);
  const [tab, setTab] = useRecordTab();
  const job = jobQuery.data;
  const sheet = job ? jobSheet(job) : null;
  const finished = sheet?.finished ?? false;
  const canAdd = sheet?.can('assign') ?? false;
  const canReport = sheet?.can('reportBreakdown') ?? false;
  const canShareJobCard = sheet?.showsMoney ?? false;
  // Someone the field Job gate keeps out (a workshop participant opening a note) came from Activity, so returns there.
  const parent = jobQuery.canRead
    ? { label: 'Jobs', href: '/contracting/jobs' as const }
    : { label: 'Activity', href: '/contracting/activity' as const };
  // The towed Implement rides along, so the report screen can offer it beside the Machine.
  const reportProblem = (stint: AssignmentDetail) =>
    router.push({
      pathname: '/contracting/workshop/report',
      params: { subjectKind: 'machine', subjectId: stint.machineId, implementId: stint.implementId ?? '', jobId },
    });
  const share = useBusyAction();
  const shareJobCard = (variant: JobCardVariant) => {
    if (job)
      void share.run(() => shareDocument(jobCardShareAction(job.jobNumber, variant)), 'Unable to share the Job Card.');
  };
  const stints = sheet?.stints ?? [];
  const [measuringId, setMeasuringId] = useState<string | null>(null);
  const measuring = stints.find((entry) => entry.stint.id === measuringId && entry.sheet.can('editMeasures'))?.stint;
  const breakdowns = useJobBreakdowns(jobId);
  const breakdownsOnStint = useMemo(
    () => breakdownsByStint(job?.assignments ?? [], breakdowns.data?.items ?? []).byStint,
    [job?.assignments, breakdowns.data],
  );

  const openHours = (stint: AssignmentDetail, params: { role: 'arrival' | 'departure' } | { mode: 'edit' }) =>
    router.push({
      pathname: '/contracting/jobs/[jobId]/capture',
      params: { jobId, assignmentId: stint.id, ...params },
    });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title="Job"
        subtitle={job?.jobNumber ?? 'CONTRACTING'}
        parentLabel={parent.label}
        onBack={() => router.replace(parent.href)}
        helpTopic="contractingMobileJob"
      />
      {job ? <RecordTabBar value={tab} onChange={setTab} /> : null}
      {tab === 'activity' ? (
        // Activity has its own server-side reach, so the thread shows even when the field Job gate hides the Job.
        <ContractingActivityFeed
          thread={{ kind: 'job', id: jobId }}
          listHeader={
            job ? (
              <AddNoteButton thread={{ kind: 'job', id: job.id, code: job.jobNumber }} verdict={job.actions.addNote} />
            ) : undefined
          }
          showControls={false}
        />
      ) : (
        <ScrollView contentContainerStyle={{ ...SECONDARY_PAGE_CONTENT_STYLE, gap: 16 }}>
          {job ? (
            <View className="gap-2 rounded-xl border border-border bg-surface p-4">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="min-w-0 flex-1 text-xl text-foreground" weight="bold" numberOfLines={1}>
                  {job.customerName}
                </Text>
                {finished ? (
                  <View className="shrink-0">
                    <JobStatusChip status={job.status} />
                  </View>
                ) : null}
              </View>
              <Text className="text-muted-foreground" numberOfLines={1}>
                {job.farmName} · {job.workTypeName}
              </Text>
              {job.description ? <Text className="text-muted-foreground">{job.description}</Text> : null}
            </View>
          ) : (
            <Text className="text-muted-foreground">
              {!jobQuery.canRead
                ? 'Your role cannot view this Job.'
                : jobQuery.gone
                  ? (jobQuery.goneReason ?? 'This Job is no longer open.')
                  : jobQuery.isError
                    ? 'This Job could not be loaded.'
                    : 'Loading Job…'}
            </Text>
          )}

          {job ? (
            <View className="-mb-2 flex-row items-center justify-between gap-2">
              <Text className="text-lg text-foreground" weight="bold">
                Machines
              </Text>
              {canAdd ? (
                <Pressable
                  accessibilityLabel="Add machine"
                  accessibilityRole="button"
                  className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
                  onPress={() => router.push(`/contracting/jobs/${job.id}/add-machine` as Href)}
                >
                  <Icon className="text-foreground" icon={IconPlus} size={20} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {stints.map((entry) => (
            <StintCard
              breakdown={mostUrgentBreakdown(breakdownsOnStint.get(entry.stint.id) ?? [])}
              canReport={canReport}
              entry={entry}
              key={entry.stint.id}
              onMeasure={() => setMeasuringId(entry.stint.id)}
              onReport={() => reportProblem(entry.stint)}
              onStart={() => openHours(entry.stint, { role: 'arrival' })}
              onStop={() => openHours(entry.stint, { role: 'departure' })}
              onEdit={() => openHours(entry.stint, { mode: 'edit' })}
              thresholds={job ?? undefined}
            />
          ))}

          {job && stints.length === 0 ? (
            <Text className="text-muted-foreground">
              {job.status === 'upcoming'
                ? 'No machines planned yet — add the first one to start this Job.'
                : 'No Machines are assigned to this Job.'}
            </Text>
          ) : null}
          {canShareJobCard ? (
            <View className="gap-2">
              <Button primary title="Share Job Card" disabled={share.busy} onPress={() => shareJobCard('customer')} />
              <Button title="Share internal copy" disabled={share.busy} onPress={() => shareJobCard('internal')} />
              {share.error ? <Text className="text-danger">{share.error}</Text> : null}
            </View>
          ) : null}
        </ScrollView>
      )}
      {measuring ? <MeasuresSheet stint={measuring} onClose={() => setMeasuringId(null)} /> : null}
    </SafeAreaView>
  );
}

const MACHINE_ICON_SIZE = 20;

/** "4 480.0 h → 4 512.0 h · 32.0 h work · 2.0 h travel", or "Arrived 4 480.0 h" while on site. */
function stintHoursLine({ arrival, departure, workHours, travelHours }: AssignmentDetail) {
  if (!arrival) return '';
  if (!departure) return `Arrived ${formatHours(arrival.hours)}`;
  return `${formatHours(arrival.hours)} → ${formatHours(departure.hours)} · ${formatHours(workHours ?? 0)} work · ${formatHours(travelHours ?? 0)} travel`;
}

function StintCard({
  entry: { stint, sheet: stintSheet },
  breakdown,
  canReport,
  onStart,
  onStop,
  onEdit,
  onMeasure,
  onReport,
  thresholds,
}: {
  entry: JobSheetStint;
  /** The most urgent unsolved Breakdown on this Machine's stint, if any. */
  breakdown: BreakdownSummary | null;
  canReport: boolean;
  onStart: () => void;
  onStop: () => void;
  onEdit: () => void;
  onMeasure: () => void;
  onReport: () => void;
  thresholds: AttentionThresholds | undefined;
}) {
  const { resolved } = useColorMode();
  return (
    <View className={`gap-2 rounded-xl border bg-surface p-4 ${breakdownBorder(breakdown) ?? 'border-border'}`}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-3">
          {breakdown ? (
            <BreakdownFlagButton
              breakdown={breakdown}
              code={stint.machineCode}
              tile={categoryTileSize(MACHINE_ICON_SIZE)}
            />
          ) : null}
          <CategoryIcon icon={stint.categoryIcon} colour={stint.categoryColour} size={MACHINE_ICON_SIZE} />
          <Text className="text-lg text-foreground" weight="bold">
            {stint.machineCode}
          </Text>
        </View>
        <StatusBadge
          classNames={assignmentStateColorClassNames[stint.state]}
          label={assignmentStateLabels[stint.state]}
        />
      </View>
      <View className="flex-row items-end justify-between gap-2">
        <View className="min-w-0 flex-1 gap-2">
          <Text className="text-sm text-muted-foreground">
            {stint.categoryName}
            {stint.implementCode ? ` · ${stint.implementCode}` : ''}
            {stint.driverName ? ` · ${getFirstName(stint.driverName)}` : ''}
          </Text>
          {stint.arrival ? <Text className="text-sm text-muted-foreground">{stintHoursLine(stint)}</Text> : null}
          {stint.measures.length ? (
            <Text className="text-sm text-foreground">
              {stint.measures
                .map((measure) => `${formatQuantity(measure.quantity)} ${measure.measureTypeName}`)
                .join(' · ')}
            </Text>
          ) : null}
        </View>
        {stint.departure && stint.workHours !== null ? (
          <Text className="text-xl text-foreground" weight="bold" mono>
            {formatHours(stint.workHours)}
          </Text>
        ) : null}
      </View>
      {thresholds && stint.attention.length ? (
        <View className={`gap-1 rounded-xl border px-3 py-2 ${needsALookColorClassNames.chip}`}>
          {stint.attention.map((kind) => (
            <Text className={`text-sm ${needsALookColorClassNames.textByScheme[resolved]}`} key={kind}>
              {assignmentAttentionSentence(kind, stint, thresholds)}
            </Text>
          ))}
        </View>
      ) : null}
      {stintSheet.can('captureArrival') ? (
        <CaptureButton icon={IconPlayerPlay} label="Start — capture arrival" onPress={onStart} />
      ) : null}
      {stintSheet.can('captureDeparture') ? (
        <CaptureButton icon={IconPlayerStop} label="Stop — capture departure" onPress={onStop} />
      ) : null}
      {stintSheet.can('editHours') ? <Button icon={IconPencil} title="Edit hours" onPress={onEdit} /> : null}
      {stintSheet.can('editMeasures') ? (
        <Button icon={IconRuler2} title={stint.measures.length ? 'Edit measures' : 'Add measure'} onPress={onMeasure} />
      ) : null}
      {canReport ? <Button icon={BreakdownIcon} title="Report a problem" onPress={onReport} /> : null}
    </View>
  );
}
