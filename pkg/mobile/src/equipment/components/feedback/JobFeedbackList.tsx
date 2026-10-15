import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { View } from 'react-native';

import { ActivityNoteEntry, ActivityNoteFooter } from '@/components/activity/ActivityEntries';
import { ActivityDayGroups } from '@/components/activity/ActivityTimeline';
import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';
import { FactCard } from '@/equipment/components/bays/job-facts';
import { GiveFeedbackButton } from '@/equipment/components/feedback/GiveFeedbackButton';
import { useTRPC } from '@/lib/trpc';
import { PurchaseOrderFeedbackMarker } from './PurchaseOrderFeedbackMarker';

/**
 * A Job's public (general) feedback, newest first, read-only, drawn as the same note entries its Activity thread uses;
 * corrective feedback never appears here (`feedback.listJobFeedback` is general-only, ADR 0010).
 */
export function JobFeedbackList({ jobCode, jobId }: { jobCode: string; jobId: string }) {
  const trpc = useTRPC();
  const feedbackQuery = useQuery(trpc.feedback.listJobFeedback.queryOptions({ jobId }));
  const items = useMemo(
    () => (feedbackQuery.data?.items ?? []).map((item) => ({ ...item, occurredAt: item.createdAt })),
    [feedbackQuery.data?.items],
  );

  return (
    <FactCard title="Feedback">
      <View className="gap-3">
        <GiveFeedbackButton jobCode={jobCode} jobId={jobId} />
        {feedbackQuery.isPending ? <Pulse className="h-16 w-full rounded-xl" /> : null}
        {feedbackQuery.error ? <Text className="text-sm text-danger">Couldn’t load feedback for this Job.</Text> : null}
        {feedbackQuery.isSuccess && items.length === 0 ? (
          <Text className="text-sm text-muted-foreground">No feedback submitted for this Job.</Text>
        ) : null}
        <ActivityDayGroups
          getItemKey={(item) => item.id}
          items={items}
          renderItem={(item, last) => (
            <ActivityNoteEntry
              author={{ name: item.submitter.name, thumbnailDataUrl: item.submitter.thumbnailDataUrl }}
              footer={
                item.purchaseOrder ? (
                  <ActivityNoteFooter>
                    <PurchaseOrderFeedbackMarker purchaseOrder={item.purchaseOrder} />
                  </ActivityNoteFooter>
                ) : null
              }
              last={last}
              occurredAt={item.occurredAt}
              text={item.text}
            />
          )}
        />
      </View>
    </FactCard>
  );
}
