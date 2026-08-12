import type { GeneralFeedbackActivityItem, JobActivityItem } from '@pkg/schema';
import { IconTimeline } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { StockBadge } from '@/components/common/StockBadge.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { OfferingThumbnail } from '@/components/thumbnail/OfferingThumbnail.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { cn } from '@/lib/utils.js';

/**
 * Whether the clamped feedback is actually hiding anything, measured rather than guessed from the
 * text: how many lines a note wraps to depends on the column it lands in, so a character count
 * offers a toggle that reveals nothing on a wide screen and withholds one on a narrow screen.
 * Only meaningful while clamped — an expanded paragraph always reports that it fits.
 */
function useIsTextClipped(enabled: boolean): [React.RefObject<HTMLParagraphElement | null>, boolean] {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element || !enabled) {
      return;
    }

    const measure = () => setClipped(element.scrollHeight > element.clientHeight);

    measure();

    // Re-measure when the column changes under a still window (the Job Sheet opening beside the
    // feed) and when the window itself changes: the clamp holds the paragraph's height fixed, so
    // its box can report no change while the text inside it reflows across the clamp boundary.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [enabled]);

  return [ref, clipped];
}

/** One feed entry, rendered by its discriminator. Each activity type of #1169 adds a case here. */
export const JobActivityCard: React.FC<{ item: JobActivityItem }> = ({ item }) => {
  switch (item.type) {
    case 'general-feedback':
      return <GeneralFeedbackActivityCard item={item} />;
  }
};

export const GeneralFeedbackActivityCard: React.FC<{ item: GeneralFeedbackActivityItem }> = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  const [textRef, clipped] = useIsTextClipped(!expanded);
  // Keep the toggle once expanded: the unclamped paragraph reads as fitting, and dropping it there
  // would strand the reader with no way back.
  const expandable = expanded || clipped;
  const jobLabel = `${item.job.code} · ${item.job.displayName}`;

  return (
    <Card className="relative transition-colors hover:bg-accent/40" size="sm">
      <CardContent>
        <article className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <EntityThumbnail
                label={item.feedback.submitter.name}
                preview={false}
                size="sm"
                thumbnailDataUrl={item.feedback.submitter.thumbnailDataUrl}
              />
              <span className="truncate">{item.feedback.submitter.name}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              <DateDisplay date={item.occurredAt} />
            </span>
            <span className="relative z-10 ms-auto flex items-center gap-1">
              <Button
                aria-label={`Open ${jobLabel} on the Gantt`}
                render={<Link search={{ job: item.job.id }} to="/jobs" />}
                size="icon"
                variant="ghost"
              >
                <IconTimeline />
              </Button>
            </span>
          </div>
          {/* The Job on the left, who it is for on the right — the two facts that place an entry. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <OfferingThumbnail
              kind={item.job.offeringKind}
              label={item.job.displayName}
              preview={false}
              size="sm"
              thumbnailDataUrl={item.job.thumbnailDataUrl}
            />
            <span className="font-mono font-medium text-muted-foreground">{item.job.code}</span>
            <span className="min-w-0 truncate text-muted-foreground">{item.job.displayName}</span>
            <span className="ms-auto min-w-0 shrink-0">
              {item.job.customerCompanyName ? (
                <span className="truncate text-muted-foreground">{item.job.customerCompanyName}</span>
              ) : (
                <StockBadge />
              )}
            </span>
          </div>
          <p className={cn('whitespace-pre-wrap text-sm leading-6', !expanded && 'line-clamp-4')} ref={textRef}>
            {item.feedback.text}
          </p>
          {expandable ? (
            <Button
              className="relative z-10 justify-self-start px-0"
              onClick={() => setExpanded((open) => !open)}
              size="sm"
              variant="link"
            >
              {expanded ? 'Show less' : 'Show more'}
            </Button>
          ) : null}
        </article>
      </CardContent>
      {/*
        A stretched link rather than a click handler on the Card: the whole entry then behaves like
        the link it is — focusable, cmd-clickable — and the controls above it stay clickable on their
        own because they sit later in the stacking order, not because a handler swallowed the event.
      */}
      <Link
        aria-label={`Open ${jobLabel}`}
        className="absolute inset-0 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        search={{ job: item.job.id }}
        to="/jobs/activity"
      />
    </Card>
  );
};
