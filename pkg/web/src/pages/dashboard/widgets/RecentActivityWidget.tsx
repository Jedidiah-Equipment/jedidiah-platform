import type { AuditEvent, AuditListInput } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { Badge } from '@/components/ui/badge.js';
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
  pageSize: 5,
  sortBy: 'occurredAt',
  sortDirection: 'desc',
} as const satisfies AuditListInput;

const RECENT_ACTIVITY_SKELETON_ROWS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

const auditActionLabels = {
  created: 'Created',
  deleted: 'Deleted',
  updated: 'Updated',
} as const satisfies Record<AuditEvent['action'], string>;

const auditEntityTypeLabels = {
  customer: 'Customer',
  document: 'Document',
  job: 'Job',
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
    <ul className="flex flex-col divide-y">
      {auditEvents.map((event) => (
        <li key={event.id} className="grid min-w-0 gap-1 py-3 text-sm first:pt-0 last:pb-0">
          <div className="flex min-w-0 items-center gap-2">
            <Badge className="shrink-0" variant="outline">
              {auditActionLabels[event.action]}
            </Badge>
            <span className="min-w-0 truncate font-medium text-foreground">{event.summary}</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
            <span>{auditEntityTypeLabels[event.entityType]}</span>
            <span aria-hidden="true">/</span>
            <span className="truncate">{event.actorName ?? event.actorEmail ?? 'System'}</span>
            <span aria-hidden="true">/</span>
            <DateDisplay date={event.occurredAt} />
          </div>
        </li>
      ))}
    </ul>
  );
};

function RecentActivityWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {RECENT_ACTIVITY_SKELETON_ROWS.map((row) => (
        <div key={row} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-40 max-w-full" />
          </div>
          <Skeleton className="h-3 w-56 max-w-full" />
        </div>
      ))}
    </div>
  );
}
