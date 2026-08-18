import { formatDate, getFirstName, JOB_ACTIVITY_EVENT_SENTENCES } from '@pkg/domain';
import type { GeneralFeedbackActivityItem, JobActivityItem, JobChangeActivityItem } from '@pkg/schema';
import { IconCheck, IconFileText, IconPencil, IconPlus, IconSubtask } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { StockBadge } from '@/components/common/StockBadge.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { OfferingThumbnail } from '@/components/thumbnail/OfferingThumbnail.js';
import { Button } from '@/components/ui/button.js';
import { Separator } from '@/components/ui/separator.js';
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
export const JobActivityEntry: React.FC<{ hideDetail?: boolean; item: JobActivityItem }> = ({
  hideDetail = false,
  item,
}) => {
  if (item.type === 'general-feedback') {
    return <GeneralFeedbackEntry hideDetail={hideDetail} item={item} />;
  }

  return <JobChangeEntry hideDetail={hideDetail} item={item} />;
};

/**
 * What was said, drawn as the speech bubble it is. Feedback is the entry a reader came for, so it
 * gets the weight — a filled node on the spine, the submitter's face, and a bubble whose tail points
 * back at them — while everything the plant merely did stays flat beside it.
 */
const GeneralFeedbackEntry: React.FC<{ hideDetail: boolean; item: GeneralFeedbackActivityItem }> = ({
  hideDetail,
  item,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [textRef, clipped] = useIsTextClipped(!expanded);
  // Keep the toggle once expanded: the unclamped paragraph reads as fitting, and dropping it there
  // would strand the reader with no way back.
  const expandable = expanded || clipped;

  return (
    <ActivityRow
      item={item}
      linkToJob={!hideDetail}
      marker={<span className="size-2.5 rounded-full bg-primary ring-4 ring-background" />}
      who={
        <EntityThumbnail
          className="z-10"
          label={getFirstName(item.feedback.submitter.name)}
          shape="circle"
          thumbnailDataUrl={item.feedback.submitter.thumbnailDataUrl}
        />
      }
    >
      <div className="relative w-fit max-w-full">
        {/*
          A rotated square rather than a border-drawn triangle: it carries the bubble's own border on
          the two edges that face out and its own background over the edge it sits on, so the tail
          keeps the bubble's outline instead of being a differently-coloured wedge beside it.
        */}
        <span
          aria-hidden
          className="absolute top-4 -left-1 size-2.5 rotate-45 border-b border-l border-border/70 bg-card transition-colors group-hover:border-foreground/25"
        />
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card transition-colors group-hover:border-foreground/25">
          <p
            className={cn('px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap', !expanded && 'line-clamp-4')}
            ref={textRef}
          >
            {item.feedback.text}
          </p>
          {expandable ? (
            <Button
              className="relative z-10 mx-3.5 mb-1 px-0"
              onClick={() => setExpanded((open) => !open)}
              size="sm"
              variant="link"
            >
              {expanded ? 'Show less' : 'Show more'}
            </Button>
          ) : null}
          {hideDetail ? null : (
            <div className="flex items-center gap-2 border-t border-border/70 bg-muted/40 py-1 pe-1.5 ps-3 text-xs">
              <OfferingThumbnail
                className="size-5"
                kind={item.job.offeringKind}
                label={item.job.displayName}
                preview={false}
                size="sm"
                thumbnailDataUrl={item.job.thumbnailDataUrl}
              />
              <JobLabel job={item.job} />
              <span className="ms-auto flex shrink-0 items-center gap-1.5">
                {item.job.customerCompanyName ? (
                  <span className="truncate text-muted-foreground">{item.job.customerCompanyName}</span>
                ) : (
                  <StockBadge />
                )}
                <Separator className="h-4 self-center" orientation="vertical" />
                <GanttButton job={item.job} />
              </span>
            </div>
          )}
        </div>
      </div>
    </ActivityRow>
  );
};

/**
 * What was done, in two flat lines beside a hollow node: who did what, then which Job it happened
 * to. No bubble and no clamp — a change event carries a filename or a date, never a paragraph, and
 * the quieter shape is what lets a reader skim past a run of them to the next thing someone said.
 */
const JobChangeEntry: React.FC<{ hideDetail: boolean; item: JobChangeActivityItem }> = ({ hideDetail, item }) => {
  const { detail, icon: Icon, sentence } = getJobChangePresentation(item);
  // No actor means either the completion sweep, which audits with a null actor on purpose, or a
  // user since deleted, whose id the FK nulled — the same collision the Audit table resolves by
  // calling both System, so this reads the same way rather than guessing at a person.
  const actorName = item.actor ? getFirstName(item.actor.name) : 'System';

  return (
    <ActivityRow
      dense
      item={item}
      linkToJob={!hideDetail}
      marker={
        <span className="size-2.5 rounded-full border border-muted-foreground/50 bg-background ring-4 ring-background" />
      }
      who={
        <span className="flex size-8 items-center justify-center rounded-full border border-border bg-muted/50 text-muted-foreground">
          <Icon aria-hidden className="size-3.5" />
        </span>
      }
    >
      <div className="min-w-0 pt-1.5">
        <p className="truncate text-sm leading-6">
          <span className="font-medium">{actorName}</span> {sentence}
        </p>
        {!hideDetail || detail !== null ? (
          <p className="flex min-w-0 items-center gap-x-2 text-sm leading-6 text-muted-foreground">
            {hideDetail ? null : <JobLabel job={item.job} />}
            {detail === null ? null : (
              <>
                {hideDetail ? null : <span aria-hidden>•</span>}
                <span className="min-w-0 truncate">{detail}</span>
              </>
            )}
            {hideDetail ? null : <GanttButton job={item.job} />}
          </p>
        ) : null}
      </div>
    </ActivityRow>
  );
};

type JobChangePresentation = {
  /** The one fact the event carries beyond its sentence, or null when it carries none. */
  detail: string | null;
  icon: React.ElementType;
  sentence: string;
};

function getJobChangePresentation(item: JobChangeActivityItem): JobChangePresentation {
  switch (item.type) {
    case 'job-created':
      return { detail: null, icon: IconPlus, sentence: JOB_ACTIVITY_EVENT_SENTENCES.created };
    case 'job-description-updated':
      return {
        detail: item.description,
        icon: IconPencil,
        sentence:
          item.description === null
            ? JOB_ACTIVITY_EVENT_SENTENCES.descriptionCleared
            : JOB_ACTIVITY_EVENT_SENTENCES.descriptionChanged,
      };
    case 'job-completed':
      // A plain date: completedOn carries no time, so a relative renderer would invent one.
      return {
        detail: formatDate(item.completedOn),
        icon: IconCheck,
        sentence: JOB_ACTIVITY_EVENT_SENTENCES.completed,
      };
    case 'job-document-added':
      return {
        detail: item.document.filename,
        icon: IconFileText,
        sentence: JOB_ACTIVITY_EVENT_SENTENCES.documentAdded,
      };
  }
}

/**
 * The four-column shell every entry shares: the node on the spine, the time it happened, who or what
 * it was, and the entry itself. The first three sit in a fixed-height head so that they centre on
 * the entry's opening line rather than drifting with however tall the entry turns out to be.
 */
const ActivityRow: React.FC<{
  children: React.ReactNode;
  dense?: boolean;
  item: JobActivityItem;
  linkToJob: boolean;
  marker: React.ReactNode;
  who: React.ReactNode;
}> = ({ children, dense = false, item, linkToJob, marker, who }) => {
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
          'absolute -top-2 -bottom-2 left-3 w-px -translate-x-1/2 bg-border',
          dense
            ? 'group-first:top-[1.125rem] group-last:bottom-[calc(100%-1.125rem)]'
            : 'group-first:top-[1.375rem] group-last:bottom-[calc(100%-1.375rem)]',
        )}
      />
      <div className="grid grid-cols-[1.5rem_3.5rem_2.5rem_minmax(0,1fr)] items-start gap-x-3">
        <span className={cn('flex items-center justify-center', head)}>{marker}</span>
        <time
          className={cn('flex items-center font-mono text-xs tabular-nums text-muted-foreground', head)}
          dateTime={item.occurredAt}
        >
          {formatDate(item.occurredAt, 'HH:mm')}
        </time>
        <span className={cn('flex items-center justify-center', head)}>{who}</span>
        <div className="flex min-w-0 items-start gap-2">{children}</div>
      </div>
      {/*
        A stretched link rather than a click handler on the row: the whole entry then behaves like
        the link it is — focusable, cmd-clickable — and the controls above it stay clickable on their
        own because they sit later in the stacking order, not because a handler swallowed the event.
      */}
      {linkToJob ? (
        <Link
          aria-label={`Open ${formatJobLabel(item.job)}`}
          className="absolute inset-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          search={{ job: item.job.id }}
          to="/jobs/activity"
        />
      ) : null}
    </div>
  );
};

/** Which Job an entry is about: its code, then what is being built. */
const JobLabel: React.FC<{ job: JobActivityItem['job'] }> = ({ job }) => (
  <>
    <span className="shrink-0 font-mono font-medium text-muted-foreground">{job.code}</span>
    <span className="min-w-0 truncate text-muted-foreground">{job.displayName}</span>
  </>
);

const GanttButton: React.FC<{ job: JobActivityItem['job'] }> = ({ job }) => (
  <Button
    aria-label={`Open ${formatJobLabel(job)} on the Gantt`}
    className="relative z-10 shrink-0"
    render={<Link search={{ job: job.id }} to="/jobs" />}
    size="icon"
    variant="ghost"
  >
    <IconSubtask />
  </Button>
);

function formatJobLabel(job: JobActivityItem['job']): string {
  return `${job.code} · ${job.displayName}`;
}
