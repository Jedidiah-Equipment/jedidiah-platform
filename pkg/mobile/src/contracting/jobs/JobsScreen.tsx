import { formatNumber } from '@pkg/domain';
import type { FieldJob } from '@pkg/schema/contracting';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MainToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import type { QueuedReading } from '@/contracting/readings/reading-queue';
import { useIsOffline } from '@/lib/connectivity';
import { jobSummary } from './derive-stint';
import { isFinishedJob, jobStatusLabel, useFinishedJobs, useJobs } from './use-jobs';

export default function JobsScreen() {
  const jobs = useJobs();
  const finished = useFinishedJobs();
  const [showFinished, setShowFinished] = useState(false);
  const { items, error } = useReadingQueue();
  const offline = useIsOffline();
  const attention = items.filter((item) => item.attention).length;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar title="Jobs" subtitle="CONTRACTING" helpTopic="contractingMobileJobs" />
      <View className="gap-3 px-4 py-3">
        {offline ? (
          <Text className="text-sm text-muted-foreground">
            Offline · showing saved Jobs. Captures stay on this phone until synced.
          </Text>
        ) : null}
        {attention > 0 ? (
          <Button
            title={`Needs attention (${attention})`}
            onPress={() =>
              router.push({ pathname: '/contracting/attention', params: { from: 'jobs' } } as unknown as Href)
            }
          />
        ) : null}
        {error ? <Text className="text-danger">{error}</Text> : null}
      </View>
      <FlatList
        data={jobs.data ?? []}
        keyExtractor={(job) => job.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 10 }}
        refreshing={!offline && (jobs.isRefetching || finished.isRefetching)}
        onRefresh={() => void Promise.all([jobs.refetch(), finished.canRead ? finished.refetch() : null])}
        ListEmptyComponent={
          <Text className="text-muted-foreground">
            {!jobs.canRead
              ? 'Your role cannot view field Jobs.'
              : jobs.data
                ? 'No Jobs are assigned to you.'
                : offline
                  ? 'Connect once to save your Jobs on this phone.'
                  : jobs.isError
                    ? 'Unable to load Jobs. Pull to retry.'
                    : 'Loading Jobs…'}
          </Text>
        }
        renderItem={({ item }) => <JobRow job={item} queued={items} />}
        ListFooterComponent={
          finished.canRead && (finished.data?.length ?? 0) > 0 ? (
            <View className="gap-2.5 pt-4">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showFinished }}
                onPress={() => setShowFinished((current) => !current)}
                className="flex-row items-center justify-between py-1"
              >
                <Text className="text-muted-foreground" weight="bold">
                  Finished ({formatNumber(finished.data?.length ?? 0)})
                </Text>
                <Text className="text-muted-foreground">{showFinished ? 'Hide' : 'Show'}</Text>
              </Pressable>
              {showFinished
                ? (finished.data ?? []).map((job) => <JobRow key={job.id} job={job} queued={items} />)
                : null}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function JobRow({ job, queued }: { job: FieldJob; queued: readonly QueuedReading[] }) {
  const summary = jobSummary(job, queued);
  const chip = isFinishedJob(job) ? jobStatusLabel(job.status) : summary.hasArrived ? null : 'Upcoming';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/contracting/jobs/${job.id}` as Href)}
      className="w-full gap-2 rounded-xl border border-border bg-surface p-4"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="min-w-0 flex-1 text-lg text-foreground" weight="bold" numberOfLines={1}>
          {job.jobNumber} · {job.farmName}
        </Text>
        {chip ? <Text className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">{chip}</Text> : null}
      </View>
      <Text className="text-sm text-muted-foreground">
        {job.workTypeName} · {summary.machines} machines · {summary.running} running
      </Text>
    </Pressable>
  );
}
