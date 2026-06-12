import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton.js';
import { cn } from '@/lib/utils.js';

type StatCardProps = {
  className?: string;
  /** Optional label override; inside the dashboard registry the widget card title is the label. */
  label?: ReactNode;
  sparkline?: ReactNode;
  sublabel?: ReactNode;
  value: ReactNode;
};

export function StatCard({ className, label, sparkline, sublabel, value }: StatCardProps) {
  return (
    <div className={cn('flex flex-1 flex-col justify-between gap-3', className)}>
      <div className="flex flex-col gap-1">
        {label ? <span className="text-sm text-muted-foreground">{label}</span> : null}
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
        {sublabel ? <span className="text-sm text-muted-foreground">{sublabel}</span> : null}
      </div>
      {sparkline ? <div className="h-10 w-full">{sparkline}</div> : null}
    </div>
  );
}

export function StatCardSkeleton({ withSparkline = false }: { withSparkline?: boolean }) {
  return (
    <div className="flex flex-1 flex-col justify-between gap-3">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-36" />
      </div>
      {withSparkline ? <Skeleton className="h-10 w-full" /> : null}
    </div>
  );
}
