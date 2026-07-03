import { formatDate } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { FactCard } from '@/components/bays/job-facts';
import { FeedbackStatusBadge } from '@/components/feedback/FeedbackStatusBadge';
import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';

/**
 * A Job's public (general) feedback, oldest first, read-only. Mirrors web's `JobFeedbackList`;
 * corrective feedback never appears here (`feedback.listJobFeedback` is general-only, ADR 0010).
 */
export function JobFeedbackList({ jobId }: { jobId: string }) {
  const trpc = useTRPC();
  const feedbackQuery = useQuery(trpc.feedback.listJobFeedback.queryOptions({ jobId }));
  const items = feedbackQuery.data?.items ?? [];

  return (
    <FactCard title="Feedback">
      <View className="gap-3">
        {feedbackQuery.isPending ? <Pulse className="h-16 w-full rounded-xl" /> : null}
        {feedbackQuery.error ? <Text className="text-sm text-danger">Couldn’t load feedback for this Job.</Text> : null}
        {feedbackQuery.isSuccess && items.length === 0 ? (
          <Text className="text-sm text-muted-foreground">No feedback submitted for this Job.</Text>
        ) : null}
        {items.map((item) => (
          <View className="gap-2 rounded-xl border border-border bg-background p-3" key={item.id}>
            <View className="flex-row items-center gap-2">
              <Avatar className="h-6 w-6 rounded-md" name={item.submitter.name} uri={item.submitter.thumbnailDataUrl} />
              <Text className="min-w-0 flex-1 text-sm text-surface-foreground" numberOfLines={1} weight="semibold">
                {item.submitter.name}
              </Text>
              <Text className="text-[10px] text-muted-foreground" mono>
                {formatDate(item.createdAt, 'd MMM yyyy')}
              </Text>
              <FeedbackStatusBadge status={item.status} />
            </View>
            <Text className="text-sm leading-5 text-surface-foreground">{item.text}</Text>
          </View>
        ))}
      </View>
    </FactCard>
  );
}
