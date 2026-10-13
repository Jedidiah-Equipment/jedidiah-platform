import { formatDate } from '@pkg/domain';
import type { DateIso } from '@pkg/schema';
import type React from 'react';

import { cn } from '@/lib/utils.js';

/**
 * The four-column shell every entry shares: the node on the spine, the time it happened, who or what
 * it was, and the entry itself. The first three sit in a fixed-height head so that they centre on
 * the entry's opening line rather than drifting with however tall the entry turns out to be.
 */
export const ActivityEntryShell: React.FC<{
  children: React.ReactNode;
  dense?: boolean;
  /**
   * A stretched link over the whole entry rather than a click handler on the row: the entry then behaves like the
   * link it is — focusable, cmd-clickable — and the controls inside it stay clickable on their own because they sit
   * later in the stacking order, not because a handler swallowed the event.
   */
  link?: React.ReactNode;
  marker: React.ReactNode;
  occurredAt: DateIso;
  who: React.ReactNode;
}> = ({ children, dense = false, link, marker, occurredAt, who }) => {
  const head = dense ? 'h-9' : 'h-11';

  return (
    <div className="group relative">
      {/*
        Each entry draws the spine across its own height and a little past it, into the gap the next
        entry starts on the other side of. Spanning the row rather than reaching for the next node is
        what keeps the line unbroken however tall either neighbour turns out to be; the day's first
        and last entries stop at their own node, which is where the day itself starts and ends.
      */}
      <span
        aria-hidden
        className={cn(
          // Half the gap either side, so one entry's line meets the next one's in the middle of it.
          'absolute -top-2.5 -bottom-2.5 left-3 w-px -translate-x-1/2 bg-border',
          dense
            ? 'group-first:top-[1.125rem] group-last:bottom-[calc(100%-1.125rem)]'
            : 'group-first:top-[1.375rem] group-last:bottom-[calc(100%-1.375rem)]',
        )}
      />
      <div className="grid grid-cols-[1.5rem_3.5rem_2.5rem_minmax(0,1fr)] items-start gap-x-3">
        <span className={cn('flex items-center justify-center', head)}>{marker}</span>
        <time
          className={cn('flex items-center font-mono text-xs tabular-nums text-muted-foreground', head)}
          dateTime={occurredAt}
        >
          {formatDate(occurredAt, 'time')}
        </time>
        <span className={cn('flex items-center justify-center', head)}>{who}</span>
        <div className="flex min-w-0 items-start gap-2">{children}</div>
      </div>
      {link}
    </div>
  );
};

/** The class a stretched entry link takes; see {@link ActivityEntryShell}'s `link`. */
export const activityEntryLinkClassName =
  'absolute inset-0 rounded-lg focus-rings:focus-visible:ring-2 focus-rings:focus-visible:ring-ring focus-rings:focus-visible:outline-none';

/** The filled node a note hangs off: what was said gets the weight. */
export const ActivityNoteMarker: React.FC = () => (
  <span className="size-2.5 rounded-full bg-primary ring-4 ring-background" />
);

/** The hollow node an event hangs off: what was done stays flat beside what was said. */
export const ActivityEventMarker: React.FC = () => (
  <span className="size-2.5 rounded-full border border-muted-foreground/50 bg-background ring-4 ring-background" />
);
