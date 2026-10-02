import { formatHours } from '@pkg/domain';
import { assignmentStateColorClassNames, deriveJobActions } from '@pkg/domain/contracting';
import type { CategoryColour, CategoryIconKey, JobCardVariant } from '@pkg/schema/contracting';
import { IconPlayerPlay, IconPlayerStop, IconPlus, type Icon as TablerIcon } from '@tabler/icons-react-native';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { CategoryIcon } from '@/contracting/components/CategoryIcon';
import { jobCardShareAction } from '@/contracting/lib/job-card';
import { newLocalId } from '@/contracting/readings/capture-attempt';
import { useSessionAccessSummary, useSessionPermission } from '@/lib/auth-session';
import { shareDocument } from '@/lib/document-actions';
import { useBusyAction } from '@/lib/use-busy-action';
import { deriveStint, type StintView } from './derive-stint';
import { JobStatusChip } from './JobStatusChip';
import { isFinishedJob, useJob } from './use-jobs';

const ORDER: Record<StintView['view'], number> = { running: 0, planned: 1, left: 2 };
const LABELS: Record<StintView['view'], string> = { planned: 'Planned', running: 'Running', left: 'Left site' };
const STINT_VIEW_COLORS = {
  planned: assignmentStateColorClassNames.planned,
  running: assignmentStateColorClassNames['on-site'],
  left: assignmentStateColorClassNames.left,
} satisfies Record<StintView['view'], typeof assignmentStateColorClassNames.planned>;

export default function JobScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const jobQuery = useJob(jobId);
  const access = useSessionAccessSummary();
  const job = jobQuery.data;
  const finished = job ? isFinishedJob(job) : false;
  const actions = job ? deriveJobActions(job, access) : null;
  const canCapture = actions?.capture.allowed ?? false;
  const canAdd = actions?.assign.allowed ?? false;
  const canShareJobCard = useSessionPermission('contracting_job:read') && finished;
  const share = useBusyAction();
  const shareJobCard = (variant: JobCardVariant) => {
    if (job)
      void share.run(() => shareDocument(jobCardShareAction(job.jobNumber, variant)), 'Unable to share the Job Card.');
  };
  const stints = (job?.stints ?? [])
    .map(deriveStint)
    .sort((left, right) => ORDER[left.view] - ORDER[right.view] || left.createdAt.localeCompare(right.createdAt));

  const openCapture = (stint: StintView, role: 'arrival' | 'departure') =>
    router.push({
      pathname: '/contracting/machines/[id]/capture',
      params: {
        id: stint.machineId,
        role,
        assignmentId: stint.id,
        jobId,
        overrideImplementId: stint.implementId ?? '',
        overrideDriverUserId: stint.driverUserId ?? '',
        implementCode: stint.implementCode ?? '',
        driverName: stint.driverName ?? '',
        captureSessionId: newLocalId(),
      },
    });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title="Job"
        subtitle={job?.jobNumber ?? 'CONTRACTING'}
        parentLabel="Jobs"
        onBack={() => router.replace('/contracting/jobs' as Href)}
        helpTopic="contractingMobileJob"
      />
      <ScrollView contentContainerStyle={{ ...SECONDARY_PAGE_CONTENT_STYLE, gap: 16 }}>
        {job ? (
          <View className="gap-2 rounded-xl border border-border bg-surface p-4">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="min-w-0 flex-1 text-xl text-foreground" weight="bold" numberOfLines={1}>
                {job.jobNumber}
              </Text>
              {finished ? (
                <View className="shrink-0">
                  <JobStatusChip status={job.status} />
                </View>
              ) : null}
            </View>
            <Text className="text-foreground">
              {job.customerName} · {job.farmName}
            </Text>
            <Text className="text-muted-foreground">{job.workTypeName}</Text>
            {job.description ? <Text className="text-muted-foreground">{job.description}</Text> : null}
          </View>
        ) : (
          <Text className="text-muted-foreground">
            {!jobQuery.canRead
              ? 'Your role cannot view this Job.'
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

        {stints.map((stint) => (
          <StintCard
            canAdd={canAdd}
            canCapture={canCapture}
            key={stint.id}
            stint={stint}
            onStart={() => openCapture(stint, 'arrival')}
            onStop={() => openCapture(stint, 'departure')}
            onReadd={() =>
              router.push({
                pathname: '/contracting/jobs/[jobId]/add-machine',
                params: {
                  jobId,
                  machineId: stint.machineId,
                  implementId: stint.implementId ?? '',
                },
              } as unknown as Href)
            }
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
    </SafeAreaView>
  );
}

function StintCard({
  stint,
  canCapture,
  canAdd,
  onStart,
  onStop,
  onReadd,
}: {
  stint: StintView;
  canCapture: boolean;
  canAdd: boolean;
  onStart: () => void;
  onStop: () => void;
  onReadd: () => void;
}) {
  return (
    <View className="gap-2 rounded-xl border border-border bg-surface p-4">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-3">
          <CategoryIcon
            icon={stint.categoryIcon as CategoryIconKey}
            colour={stint.categoryColour as CategoryColour}
            size={20}
          />
          <Text className="text-lg text-foreground" weight="bold">
            {stint.machineCode}
          </Text>
        </View>
        <StatusBadge classNames={STINT_VIEW_COLORS[stint.view]} label={LABELS[stint.view]} />
      </View>
      <Text className="text-sm text-muted-foreground">
        {stint.categoryName}
        {stint.implementCode ? ` · ${stint.implementCode}` : ''}
        {stint.driverName ? ` · ${stint.driverName}` : ''}
      </Text>
      {stint.arrival ? (
        <Text className="text-sm text-muted-foreground">
          Arrived {formatHours(stint.arrival.value)}
          {stint.arrival.photoBacked ? ' · photo' : ' · no photo'}
        </Text>
      ) : null}
      {stint.departure ? (
        <Text className="text-sm text-muted-foreground">Departed {formatHours(stint.departure.value)}</Text>
      ) : null}
      {stint.view === 'planned' && canCapture ? (
        <CaptureButton icon={IconPlayerPlay} label="Start — capture arrival" onPress={onStart} />
      ) : null}
      {stint.view === 'running' && canCapture ? (
        <CaptureButton icon={IconPlayerStop} label="Stop — capture departure" onPress={onStop} />
      ) : null}
      {stint.view === 'left' && canAdd ? <Button title="Re-add machine" onPress={onReadd} /> : null}
    </View>
  );
}

function CaptureButton({ icon, label, onPress }: { icon: TablerIcon; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      className="flex-row items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 py-3 active:bg-surface"
      onPress={onPress}
    >
      <Icon className="text-primary" icon={icon} size={16} />
      <Text className="text-sm text-foreground" weight="semibold">
        {label}
      </Text>
    </Pressable>
  );
}
