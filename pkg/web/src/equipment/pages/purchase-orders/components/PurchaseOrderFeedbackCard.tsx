import { getFirstName } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { ActivityNoteEntry } from '@/components/activity/ActivityEntries.js';
import { ActivityTimeline } from '@/components/activity/ActivityTimeline.js';
import { HelpLink } from '@/components/help/HelpLink.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { PurchaseOrderFeedbackButton } from '@/equipment/components/feedback/PurchaseOrderFeedbackButton.js';
import { useTRPC } from '@/lib/trpc.js';

export function PurchaseOrderFeedbackCard({ purchaseOrderId, code }: { purchaseOrderId: UUID; code: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.feedback.listPurchaseOrderFeedback.queryOptions({ purchaseOrderId }));
  const items = useMemo(
    () => (query.data?.items ?? []).map((item) => ({ ...item, occurredAt: item.createdAt })),
    [query.data?.items],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Feedback
          <HelpLink label="Help with Purchase Order Feedback" topic="purchaseOrderFeedback" />
        </CardTitle>
        <CardAction>
          <PurchaseOrderFeedbackButton purchaseOrder={{ id: purchaseOrderId, code }} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ActivityTimeline
          emptyMessage="No feedback submitted for this Purchase Order."
          errorMessage="Unable to load feedback."
          getItemKey={(item) => item.id}
          items={items}
          query={query}
          renderItem={(item) => (
            <ActivityNoteEntry
              author={{ name: getFirstName(item.submitter.name), thumbnailDataUrl: item.submitter.thumbnailDataUrl }}
              occurredAt={item.occurredAt}
              text={item.text}
            />
          )}
        />
      </CardContent>
    </Card>
  );
}
