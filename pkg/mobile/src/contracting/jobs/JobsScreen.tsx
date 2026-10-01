import { formatNumber } from '@pkg/domain';
import type { FieldJob } from '@pkg/schema/contracting';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MainToolbar } from '@/components/TopToolbar';
import { Text } from '@/components/ui/text';
import { jobSummary } from './derive-stint';
import { JobStatusChip } from './JobStatusChip';
import { isFinishedJob, useFinishedJobs, useJobs } from './use-jobs';

export default function JobsScreen() {
  const jobs = useJobs();
  const finished = useFinishedJobs();
  const [showFinished, setShowFinished] = useState(false);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar title="Jobs" subtitle="CONTRACTING" helpTopic="contractingMobileJobs" />
      <FlatList
        data={jobs.data ?? []}
        keyExtractor={(job) => job.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 10 }}
        refreshing={jobs.isRefetching || finished.isRefetching}
        onRefresh={() => void Promise.all([jobs.refetch(), finished.canRead ? finished.refetch() : null])}
        ListEmptyComponent={
          <Text className="text-muted-foreground">
            {!jobs.canRead
              ? 'Your role cannot view field Jobs.'
              : jobs.data
                ? 'No Jobs are assigned to you.'
                : jobs.isError
                  ? 'Unable to load Jobs. Pull to retry.'
                  : 'Loading Jobs…'}
          </Text>
        }
        renderItem={({ item }) => <JobRow job={item} />}
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
              {showFinished ? (finished.data ?? []).map((job) => <JobRow key={job.id} job={job} />) : null}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function JobRow({ job }: { job: FieldJob }) {
  const summary = jobSummary(job);
  const chipStatus = isFinishedJob(job) ? job.status : summary.hasArrived ? null : 'upcoming';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/contracting/jobs/${job.id}` as Href)}
      className="w-full gap-2 rounded-xl border border-border bg-surface p-4"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="min-w-0 flex-1 text-lg text-foreground" weight="bold" numberOfLines={1}>
          {job.customerName} · {job.farmName}
        </Text>
        {chipStatus ? (
          <View className="shrink-0">
            <JobStatusChip status={chipStatus} />
          </View>
        ) : null}
      </View>
      <Text className="text-sm text-muted-foreground">
        {job.workTypeName} · {summary.machines} machines · {summary.running} running
      </Text>
    </Pressable>
  );
}
