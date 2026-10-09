import { assignmentAttentionLevelColorClassNames, breakdownUrgencyColorClassNames } from '@pkg/domain/contracting';
import type { AssignmentAttentionLevel, BreakdownUrgency, NeedsALookLevel } from '@pkg/schema/contracting';
import type { Icon as TablerIcon } from '@tabler/icons-react';
import type React from 'react';
import { Button } from '@/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { cn } from '@/lib/utils.js';

/** The rail every timeline step hangs from; children are `TimelineRow`s. */
export function Timeline({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ol className={cn('ml-2 space-y-3 border-l border-border pl-5', className)}>{children}</ol>;
}

/** A step's dot: where it stands, an attention level, or a Breakdown's urgency, each in its domain colour. */
export type DotTone = 'done' | 'current' | 'empty' | NeedsALookLevel | BreakdownUrgency;

const dotClassNames: Record<DotTone, string> = {
  done: 'border-emerald-500 bg-emerald-500',
  current: 'border-primary bg-primary',
  empty: 'border-muted-foreground bg-card',
  warning: `border-transparent ${assignmentAttentionLevelColorClassNames.warning.dot}`,
  critical: `border-transparent ${assignmentAttentionLevelColorClassNames.critical.dot}`,
  'code-red': `border-transparent ${breakdownUrgencyColorClassNames['code-red'].dot}`,
  'code-green': `border-transparent ${breakdownUrgencyColorClassNames['code-green'].dot}`,
};

/** One step on a vertical timeline: a dot on the rail, a title and detail, and its actions on the right. */
export function TimelineRow({
  title,
  detail,
  tone,
  dotContent,
  actions,
}: {
  title: React.ReactNode;
  detail: React.ReactNode;
  tone: DotTone;
  /** A glyph drawn inside the dot, such as a resolved row's tick. */
  dotContent?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <li className="relative flex min-h-9 items-start justify-between gap-2">
      <span
        aria-hidden="true"
        className={cn(
          'absolute -left-[27px] top-1 flex size-3 items-center justify-center rounded-full border-2',
          dotClassNames[tone],
        )}
      >
        {dotContent}
      </span>
      <div className="min-w-0">
        <strong className="block text-sm leading-5 font-medium">{title}</strong>
        <div className="text-xs leading-4 text-muted-foreground">{detail}</div>
      </div>
      {actions ? <div className="flex shrink-0 items-start gap-1">{actions}</div> : null}
    </li>
  );
}

/** An outlined icon button with its label as tooltip and accessible name. */
export function IconAction({
  label,
  icon: Icon,
  onClick,
  level,
}: {
  label: string;
  icon: TablerIcon;
  onClick: () => void;
  /** Paints the button in an assignment attention level's colours. */
  level?: AssignmentAttentionLevel;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={level ? assignmentAttentionLevelColorClassNames[level].button : undefined}
            onClick={onClick}
            size="icon-sm"
            type="button"
            variant="outline"
          />
        }
      >
        <Icon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
