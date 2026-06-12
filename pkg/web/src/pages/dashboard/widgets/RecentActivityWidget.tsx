import type { AuditEvent, AuditListInput } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Badge } from '@/components/ui/badge.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';

const RECENT_ACTIVITY_LIST_INPUT = {
  filters: {
    actorUserIds: [],
    entityIds: [],
    entityTypes: [],
  },
  page: 1,
  pageSize: 8,
  sortBy: 'occurredAt',
  sortDirection: 'desc',
} as const satisfies AuditListInput;

const RECENT_ACTIVITY_SKELETON_ROWS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
] as const;

const auditActionLabels = {
  created: 'Created',
  deleted: 'Deleted',
  updated: 'Updated',
} as const satisfies Record<AuditEvent['action'], string>;

const auditEntityTypeLabels = {
  customer: 'Customer',
  document: 'Document',
  job: 'Job',
  job_bay: 'Bay',
  part: 'Part',
  product: 'Product',
  quote: 'Quote',
  supplier: 'Supplier',
  user: 'User',
} as const satisfies Record<AuditEvent['entityType'], string>;

export const RecentActivityWidget: React.FC = () => {
  const trpc = useTRPC();
  const auditQuery = useQuery(trpc.audit.list.queryOptions(RECENT_ACTIVITY_LIST_INPUT));
  const auditEvents = auditQuery.data?.items ?? [];

  if (auditQuery.error) {
    return <DashboardWidgetError error={auditQuery.error} fallbackMessage="Unable to load recent activity." />;
  }

  if (auditQuery.isPending) {
    return <RecentActivityWidgetSkeleton />;
  }

  if (auditEvents.length === 0) {
    return <DashboardWidgetEmpty>No activity yet.</DashboardWidgetEmpty>;
  }

  return (
    <ScrollArea className="max-h-80">
      <ul className="flex flex-col divide-y pr-3">
        {auditEvents.map((event) => (
          <li key={event.id} className="flex min-w-0 gap-3 py-3 text-sm first:pt-0 last:pb-0">
            <EntityThumbnail label={getActorLabel(event)} size="sm" />
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="flex min-w-0 items-center gap-2">
                <Badge className="shrink-0" variant="outline">
                  {auditActionLabels[event.action]}
                </Badge>
                <span className="min-w-0 truncate font-medium text-foreground">{event.summary}</span>
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
                <span>{getActorLabel(event)}</span>
                <span aria-hidden="true">/</span>
                <span>{auditEntityTypeLabels[event.entityType]}</span>
                <span aria-hidden="true">/</span>
                <DateDisplay date={event.occurredAt} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
};

function RecentActivityWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {RECENT_ACTIVITY_SKELETON_ROWS.map((row) => (
        <div key={row} className="flex items-start gap-3">
          <Skeleton className="size-6 rounded-md" />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </span>
        </div>
      ))}
    </div>
  );
}

function getActorLabel(event: Pick<AuditEvent, 'actorEmail' | 'actorName'>): string {
  return event.actorName ?? event.actorEmail ?? 'System';
}
