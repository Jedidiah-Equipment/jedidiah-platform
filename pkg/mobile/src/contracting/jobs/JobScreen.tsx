import type { CategoryColour, CategoryIconKey } from '@pkg/schema/contracting';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { CategoryIcon } from '@/contracting/components/CategoryIcon';
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import { useFleet } from '@/contracting/readings/use-fleet';
import { useSessionPermission } from '@/lib/auth-session';
import { useIsOffline } from '@/lib/connectivity';
import { deriveStint, queuedUnplannedStints, type StintView } from './derive-stint';
import { useImplements, useJob } from './use-jobs';

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
  const { items, error } = useReadingQueue();
  const canCapture = useSessionPermission('contracting_reading:capture');
  const canAdd = useSessionPermission('contracting_assignment:update-own', 'contracting_job:assign');
  const offline = useIsOffline();
  const job = jobQuery.data;
  const serverIds = new Set(job?.stints.map((stint) => stint.id) ?? []);
  const stints = job
    ? [
        ...job.stints.map((stint) => deriveStint(stint, items)),
        ...queuedUnplannedStints(job.id, items, fleet.data ?? [], implementQuery.data ?? []).filter(
          (stint) => !serverIds.has(stint.id),
        ),
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
                params: { jobId, machineId: stint.machineId, implementId: stint.implementId ?? '' },
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
        <Text className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">{LABELS[stint.view]}</Text>
      </View>
      <Text className="text-sm text-muted-foreground">
        {stint.categoryName}
        {stint.implementCode ? ` · ${stint.implementCode}` : ''}
        {stint.driverName ? ` · ${stint.driverName}` : ''}
      </Text>
      {stint.arrival ? (
        <Text className="text-sm text-muted-foreground">
          Arrived {stint.arrival.value.toFixed(1)} h{stint.arrival.photoBacked ? ' · photo' : ' · no photo'}
        </Text>
      ) : null}
      {stint.departure ? (
        <Text className="text-sm text-muted-foreground">Departed {stint.departure.value.toFixed(1)} h</Text>
      ) : null}
      {stint.view === 'planned' && canCapture ? (
        <Button primary title="Start — capture arrival" onPress={onStart} />
      ) : null}
      {(stint.view === 'running' || stint.view === 'starting') && canCapture ? (
        <Button primary title="Stop — capture departure" onPress={onStop} />
      ) : null}
      {stint.view === 'left' && canAdd ? <Button title="Re-add machine" onPress={onReadd} /> : null}
      {stint.view === 'attention' ? (
        <Button title="Open Needs attention" onPress={() => router.push('/contracting/attention')} />
      ) : null}
    </View>
  );
}
