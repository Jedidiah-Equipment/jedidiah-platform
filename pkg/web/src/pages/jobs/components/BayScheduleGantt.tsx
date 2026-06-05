import type { Bay } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import {
  GanttHeader,
  GanttProvider,
  GanttSidebar,
  GanttTimeline,
  GanttToday,
} from '@/components/kibo-ui/gantt/index.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';

export const BayScheduleGantt: React.FC = () => {
  const trpc = useTRPC();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const bays = baysQuery.data?.items ?? [];
  const initialDate = useMemo(() => new Date(), []);

  if (baysQuery.isLoading) {
    return <Skeleton className="h-56 w-full" />;
  }

  if (baysQuery.error) {
    return <ErrorMessage error={baysQuery.error} fallbackMessage="Unable to load bay schedule." />;
  }

  if (bays.length === 0) {
    return null;
  }

  return (
    <div
      className="w-full overflow-hidden"
      style={{
        height: Math.max(220, 60 + bays.length * 36),
      }}
    >
      <GanttProvider
        className="h-full border border-border/70 bg-background"
        initialDate={initialDate}
        initialDateAlignment="start"
        range="monthly"
      >
        <BayScheduleSidebar bays={bays} />
        <GanttTimeline>
          <GanttHeader />
          <BayLaneDividers bays={bays} />
          <GanttToday className="bg-primary text-primary-foreground" />
        </GanttTimeline>
      </GanttProvider>
    </div>
  );
};

const BayScheduleSidebar: React.FC<{
  bays: Bay[];
}> = ({ bays }) => (
  <GanttSidebar secondaryTitle={null} title="Bay">
    <div className="divide-y divide-border/50">
      {bays.map((bay) => (
        <div className="flex items-center px-2.5 text-xs" key={bay.id} style={{ height: 'var(--gantt-row-height)' }}>
          <p className="truncate font-medium">{bay.name}</p>
        </div>
      ))}
    </div>
  </GanttSidebar>
);

const BayLaneDividers: React.FC<{
  bays: Bay[];
}> = ({ bays }) => (
  <div className="pointer-events-none absolute top-(--gantt-header-height) left-0 z-10 w-full">
    {bays.map((bay) => (
      <div
        className="border-border/50 border-b"
        key={bay.id}
        style={{
          height: 'var(--gantt-row-height)',
        }}
      />
    ))}
  </div>
);
