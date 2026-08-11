import type { GeneralFeedbackActivityItem, JobActivityItem } from '@pkg/schema';
import { IconTimeline } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { StockBadge } from '@/components/common/StockBadge.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { cn } from '@/lib/utils.js';

/**
 * Roughly the four clamped lines a card shows before the toggle earns its place. Measuring the real
 * line count needs layout, and a feed of mostly-short notes should not pay for that.
 */
const EXPANDABLE_TEXT_LENGTH = 280;

/** The clamp shows four lines, so feedback that already breaks past four needs the toggle too. */
const CLAMPED_LINES = 4;

function isExpandable(text: string): boolean {
  return text.length > EXPANDABLE_TEXT_LENGTH || text.split('\n').length > CLAMPED_LINES;
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
  const expandable = isExpandable(item.feedback.text);
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
            <span className="font-medium">{item.job.code}</span>
            <span className="min-w-0 truncate text-muted-foreground">{item.job.displayName}</span>
            {item.job.serialNumber ? (
              <span className="truncate font-mono text-xs text-muted-foreground">{item.job.serialNumber}</span>
            ) : null}
            <span className="ms-auto min-w-0 shrink-0">
              {item.job.customerCompanyName ? (
                <span className="truncate text-muted-foreground">{item.job.customerCompanyName}</span>
              ) : (
                <StockBadge />
              )}
            </span>
          </div>
          <p className={cn('whitespace-pre-wrap text-sm leading-6', expandable && !expanded && 'line-clamp-4')}>
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
