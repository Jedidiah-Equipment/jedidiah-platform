import type {
  GeneralFeedbackActivityItem,
  JobActivityActor,
  JobActivityItem,
  JobChangeActivityItem,
} from '@pkg/schema';
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

/** One feed entry, rendered by its discriminator. A new activity type adds a case here. */
export const JobActivityCard: React.FC<{ item: JobActivityItem }> = ({ item }) => {
  switch (item.type) {
    case 'general-feedback':
      return <GeneralFeedbackActivityCard item={item} />;
    case 'job-created':
      return <JobChangeActivityCard item={item}>created this Job</JobChangeActivityCard>;
    case 'job-description-updated':
      return (
        <JobChangeActivityCard item={item}>
          {item.description === null ? 'cleared the Job description' : 'changed the Job description'}
          {item.description === null ? null : <ChangeDetail>{item.description}</ChangeDetail>}
        </JobChangeActivityCard>
      );
    case 'job-completed':
      return (
        <JobChangeActivityCard item={item}>
          completed this Job
          <ChangeDetail>
            <DateDisplay date={item.completedOn} />
          </ChangeDetail>
        </JobChangeActivityCard>
      );
    case 'job-document-added':
      return (
        <JobChangeActivityCard item={item}>
          added a document
          <ChangeDetail>{item.document.filename}</ChangeDetail>
        </JobChangeActivityCard>
      );
  }
};

export const GeneralFeedbackActivityCard: React.FC<{ item: GeneralFeedbackActivityItem }> = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  const [textRef, clipped] = useIsTextClipped(!expanded);
  // Keep the toggle once expanded: the unclamped paragraph reads as fitting, and dropping it there
  // would strand the reader with no way back.
  const expandable = expanded || clipped;

  return (
    <ActivityCard item={item}>
      <ActivityHeader
        actor={item.feedback.submitter}
        item={item}
        name={<span className="truncate font-medium">{item.feedback.submitter.name}</span>}
      />
      <ActivityJobLine job={item.job} />
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
    </ActivityCard>
  );
};

/**
 * A change event, in one line: who did what, and to which Job. No clamp and no expand toggle — the
 * payload is a filename or a date, never a paragraph.
 */
const JobChangeActivityCard: React.FC<{ children: React.ReactNode; item: JobChangeActivityItem }> = ({
  children,
  item,
}) => {
  // An actor the audit row no longer names — the user was deleted — still leaves an event worth
  // reading, so the sentence keeps its subject rather than losing the verb with the name.
  const actorName = item.actor?.name ?? 'A removed user';

  return (
    <ActivityCard item={item}>
      <ActivityHeader
        actor={item.actor}
        item={item}
        name={
          <span className="min-w-0 truncate">
            <span className="font-medium">{actorName}</span> {children}
          </span>
        }
      />
      <ActivityJobLine job={item.job} />
    </ActivityCard>
  );
};

const ChangeDetail: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-muted-foreground"> — {children}</span>
);

/** The card shell every entry shares, including the stretched link that opens its Job. */
const ActivityCard: React.FC<{ children: React.ReactNode; item: JobActivityItem }> = ({ children, item }) => (
  <Card className="relative transition-colors hover:bg-accent/40" size="sm">
    <CardContent>
      <article className="grid gap-2">{children}</article>
    </CardContent>
    {/*
      A stretched link rather than a click handler on the Card: the whole entry then behaves like
      the link it is — focusable, cmd-clickable — and the controls above it stay clickable on their
      own because they sit later in the stacking order, not because a handler swallowed the event.
    */}
    <Link
      aria-label={`Open ${formatJobLabel(item.job)}`}
      className="absolute inset-0 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      search={{ job: item.job.id }}
      to="/jobs/activity"
    />
  </Card>
);

const ActivityHeader: React.FC<{
  actor: JobActivityActor | null;
  item: JobActivityItem;
  name: React.ReactNode;
}> = ({ actor, item, name }) => (
  <div className="flex flex-wrap items-center gap-2">
    <span className="flex min-w-0 items-center gap-2 text-sm">
      <EntityThumbnail
        label={actor?.name ?? ''}
        preview={false}
        size="sm"
        thumbnailDataUrl={actor?.thumbnailDataUrl ?? null}
      />
      {name}
    </span>
    <span className="text-xs text-muted-foreground">
      <DateDisplay date={item.occurredAt} />
    </span>
    <span className="relative z-10 ms-auto flex items-center gap-1">
      <Button
        aria-label={`Open ${formatJobLabel(item.job)} on the Gantt`}
        render={<Link search={{ job: item.job.id }} to="/jobs" />}
        size="icon"
        variant="ghost"
      >
        <IconTimeline />
      </Button>
    </span>
  </div>
);

/** The Job on the left, who it is for on the right — the two facts that place an entry. */
const ActivityJobLine: React.FC<{ job: JobActivityItem['job'] }> = ({ job }) => (
  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
    <OfferingThumbnail
      kind={job.offeringKind}
      label={job.displayName}
      preview={false}
      size="sm"
      thumbnailDataUrl={job.thumbnailDataUrl}
    />
    <span className="font-mono font-medium text-muted-foreground">{job.code}</span>
    <span className="min-w-0 truncate text-muted-foreground">{job.displayName}</span>
    <span className="ms-auto min-w-0 shrink-0">
      {job.customerCompanyName ? (
        <span className="truncate text-muted-foreground">{job.customerCompanyName}</span>
      ) : (
        <StockBadge />
      )}
    </span>
  </div>
);

function formatJobLabel(job: JobActivityItem['job']): string {
  return `${job.code} · ${job.displayName}`;
}
