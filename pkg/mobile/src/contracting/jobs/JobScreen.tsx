import { formatHours } from '@pkg/domain';
import { deriveJobActions } from '@pkg/domain/contracting';
import type { CategoryColour, CategoryIconKey, JobCardVariant } from '@pkg/schema/contracting';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { CategoryIcon } from '@/contracting/components/CategoryIcon';
import { jobCardShareAction } from '@/contracting/lib/job-card';
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import { newLocalId } from '@/contracting/readings/reading-queue';
import { useFleet } from '@/contracting/readings/use-fleet';
import { useSessionAccessSummary, useSessionPermission } from '@/lib/auth-session';
import { useIsOffline } from '@/lib/connectivity';
import { shareDocument } from '@/lib/document-actions';
import { useBusyAction } from '@/lib/use-busy-action';
import { deriveStint, jobSummary, queuedUnplannedStints, type StintView } from './derive-stint';
import { isFinishedJob, jobStatusLabel, useDrivers, useImplements, useJob } from './use-jobs';

const ORDER: Record<StintView['view'], number> = {
  running: 0,
  starting: 1,
  stopping: 1,
  attention: 2,
  planned: 3,
  left: 4,
};
const LABELS: Record<StintView['view'], string> = {
  planned: 'Planned',
  starting: 'Starting…',
  running: 'Running',
  stopping: 'Stopping…',
  left: 'Left site',
  attention: 'Needs attention',
};

export default function JobScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const jobQuery = useJob(jobId);
  const fleet = useFleet();
  const implementQuery = useImplements();
  const driversQuery = useDrivers();
  const { items, error } = useReadingQueue();
  const access = useSessionAccessSummary();
  const offline = useIsOffline();
  const job = jobQuery.data;
  const finished = job ? isFinishedJob(job) : false;
  // Judged against the Job as it will stand once the queue syncs, since the phone captures offline.
  const actions = job ? deriveJobActions({ ...job, status: jobSummary(job, items).status }, access) : null;
  const canCapture = actions?.capture.allowed ?? false;
  const canAdd = actions?.assign.allowed ?? false;
  const canShareJobCard = useSessionPermission('contracting_job:read') && finished;
  const share = useBusyAction();
  const shareJobCard = (variant: JobCardVariant) => {
    if (job)
      void share.run(() => shareDocument(jobCardShareAction(job.jobNumber, variant)), 'Unable to share the Job Card.');
  };
  const serverIds = new Set(job?.stints.map((stint) => stint.id) ?? []);
  const stints = job
    ? [
        ...job.stints.map((stint) =>
          deriveStint(stint, items, { implements: implementQuery.data ?? [], drivers: driversQuery.data ?? [] }),
        ),
        ...queuedUnplannedStints(
          job.id,
          items,
          fleet.data ?? [],
          implementQuery.data ?? [],
          driversQuery.data ?? [],
        ).filter((stint) => !serverIds.has(stint.id)),
      ].sort((left, right) => ORDER[left.view] - ORDER[right.view] || left.createdAt.localeCompare(right.createdAt))
    : [];

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
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {offline ? <Text className="text-muted-foreground">Offline · showing the saved Job</Text> : null}
        {job ? (
          <View className="gap-2 rounded-xl border border-border bg-surface p-4">
            <Text className="text-xl text-foreground" weight="bold">
              {job.jobNumber}
            </Text>
            <Text className="text-foreground">
              {job.customerName} · {job.farmName}
            </Text>
            <Text className="text-muted-foreground">{job.workTypeName}</Text>
            {job.description ? <Text className="text-muted-foreground">{job.description}</Text> : null}
            {finished ? <Text className="text-muted-foreground">{jobStatusLabel(job.status)}</Text> : null}
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
            onAttention={() =>
              router.push({
                pathname: '/contracting/attention',
                params: { from: 'job', jobId },
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
        {error ? <Text className="text-danger">{error}</Text> : null}
        {canShareJobCard ? (
          <View className="gap-2">
            <Button
              primary
              title="Share Job Card"
              disabled={share.busy || offline}
              onPress={() => shareJobCard('customer')}
            />
            <Button
              title="Share internal copy"
              disabled={share.busy || offline}
              onPress={() => shareJobCard('internal')}
            />
            {share.error ? <Text className="text-danger">{share.error}</Text> : null}
          </View>
        ) : null}
        {job && canAdd ? (
          <Button
            primary
            title="+ Add machine"
            onPress={() => router.push(`/contracting/jobs/${job.id}/add-machine` as Href)}
          />
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
  onAttention,
}: {
  stint: StintView;
  canCapture: boolean;
  canAdd: boolean;
  onStart: () => void;
  onStop: () => void;
  onReadd: () => void;
  onAttention: () => void;
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
        <Text className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">{LABELS[stint.view]}</Text>
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
        <Button primary title="Start — capture arrival" onPress={onStart} />
      ) : null}
      {(stint.view === 'running' || stint.view === 'starting') && canCapture ? (
        <Button primary title="Stop — capture departure" onPress={onStop} />
      ) : null}
      {(stint.view === 'left' || stint.view === 'stopping') && canAdd ? (
        <Button title="Re-add machine" onPress={onReadd} />
      ) : null}
      {stint.view === 'attention' ? <Button title="Open Needs attention" onPress={onAttention} /> : null}
    </View>
  );
}
