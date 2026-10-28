import type { OpenBreakdown } from '@pkg/schema/contracting';
import { Link } from '@tanstack/react-router';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card.js';
import { BreakdownStatusBadge, BreakdownUrgencyIcon } from '@/contracting/components/BreakdownSubjectLabel.js';

/** A row's unsolved Breakdowns, one flag each, most urgent first as served: hover to read it, click to open it. */
export function BreakdownFlags({ breakdowns }: { breakdowns: readonly OpenBreakdown[] }) {
  if (breakdowns.length === 0) return <span className="text-sm text-muted-foreground">No breakdowns</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {breakdowns.map((breakdown) => (
        <BreakdownFlag breakdown={breakdown} key={breakdown.id} />
      ))}
    </div>
  );
}

function BreakdownFlag({ breakdown }: { breakdown: OpenBreakdown }) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Link
            className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            params={{ id: breakdown.id }}
            to="/contracting/workshop/$id"
          />
        }
      >
        <BreakdownUrgencyIcon showTitle={false} size={16} urgency={breakdown.urgency} />
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 max-w-[calc(100vw-2rem)]" side="bottom">
        <div className="flex flex-col gap-1 p-1">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-sm font-medium">{breakdown.subjectCode}</span>
            <BreakdownStatusBadge status={breakdown.status} />
          </div>
          <span className="line-clamp-3 text-xs text-muted-foreground">{breakdown.firstLine}</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
