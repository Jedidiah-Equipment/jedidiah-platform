import { groupActivityByDay } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { ActivityNoteBubble } from '@/components/activity/ActivityNoteBubble.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { HelpLink } from '@/components/help/HelpLink.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { FeedbackTimelineEntry } from '@/equipment/components/feedback/FeedbackTimelineEntry.js';
import { GiveFeedbackButton } from '@/equipment/components/feedback/GiveFeedbackButton.js';
import { useTRPC } from '@/lib/trpc.js';

export function PurchaseOrderFeedbackCard({ purchaseOrderId, code }: { purchaseOrderId: UUID; code: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.feedback.listPurchaseOrderFeedback.queryOptions({ purchaseOrderId }));
  const items = (query.data?.items ?? []).map((item) => ({ ...item, occurredAt: item.createdAt }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Feedback
          <HelpLink label="Help with Purchase Order Feedback" topic="purchaseOrderFeedback" />
        </CardTitle>
        <CardAction>
          <GiveFeedbackButton subject={{ subjectType: 'purchase-order', purchaseOrderId }} subjectLabel={code} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6">
        <ErrorMessage error={query.error} fallbackMessage="Unable to load feedback." />
        {query.isPending ? <Skeleton className="h-24" /> : null}
        {query.isSuccess && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No feedback submitted for this Purchase Order.</p>
        ) : null}
        {groupActivityByDay(items).map((group) => (
          <section className="grid gap-3" key={group.day}>
            <h2 className="font-medium text-xs tracking-[0.18em] uppercase">{group.label}</h2>
            <div className="grid gap-5">
              {group.items.map((item) => (
                <FeedbackTimelineEntry key={item.id} occurredAt={item.createdAt} submitter={item.submitter}>
                  <ActivityNoteBubble text={item.text} />
                </FeedbackTimelineEntry>
              ))}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
