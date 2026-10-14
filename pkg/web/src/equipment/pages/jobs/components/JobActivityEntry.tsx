import { statusBadgeColorClassNames } from '@pkg/domain';
import { presentJobActivityEvent } from '@pkg/domain/equipment';
import {
  type FeedbackPurchaseOrder,
  formatPurchaseOrderCode,
  type GeneralFeedbackActivityItem,
  type JobActivityItem,
  type JobChangeActivityItem,
} from '@pkg/schema/equipment';
import {
  IconCheck,
  IconClock,
  IconFileText,
  IconPencil,
  IconPlus,
  IconShoppingCart,
  IconSubtask,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type React from 'react';
import {
  ActivityEntryShell,
  ActivityEventMarker,
  activityEntryLinkClassName,
} from '@/components/activity/ActivityEntryShell.js';
import { ActivityNoteBubble } from '@/components/activity/ActivityNoteBubble.js';
import { Button } from '@/components/ui/button.js';
import { Separator } from '@/components/ui/separator.js';
import { StockBadge } from '@/equipment/components/common/StockBadge.js';
import { FeedbackTimelineEntry } from '@/equipment/components/feedback/FeedbackTimelineEntry.js';
import { OfferingThumbnail } from '@/equipment/components/thumbnail/OfferingThumbnail.js';
import { cn } from '@/lib/utils.js';

/** One feed entry, rendered by its discriminator. A new activity type adds a case here. */
export const JobActivityEntry: React.FC<{
  canReadPurchaseOrder?: boolean;
  hideDetail?: boolean;
  item: JobActivityItem;
}> = ({ canReadPurchaseOrder = false, hideDetail = false, item }) => {
  if (item.type === 'general-feedback') {
    return <GeneralFeedbackEntry canReadPurchaseOrder={canReadPurchaseOrder} hideDetail={hideDetail} item={item} />;
  }

  return <JobChangeEntry hideDetail={hideDetail} item={item} />;
};

/**
 * What was said, drawn as the speech bubble it is. Feedback is the entry a reader came for, so it
 * gets the weight — a filled node on the spine, the submitter's face, and a bubble whose tail points
 * back at them — while everything the plant merely did stays flat beside it.
 */
const GeneralFeedbackEntry: React.FC<{
  canReadPurchaseOrder: boolean;
  hideDetail: boolean;
  item: GeneralFeedbackActivityItem;
}> = ({ canReadPurchaseOrder, hideDetail, item }) => (
  <FeedbackTimelineEntry
    occurredAt={item.occurredAt}
    submitter={item.feedback.submitter}
    link={
      hideDetail ? null : (
        <Link
          aria-label={`Open ${formatJobLabel(item.job)}`}
          className={activityEntryLinkClassName}
          search={{ job: item.job.id }}
          to="/equipment/jobs/activity"
        />
      )
    }
  >
    <ActivityNoteBubble
      footer={
        hideDetail ? (
          item.purchaseOrder ? (
            <PurchaseOrderMarker canRead={canReadPurchaseOrder} purchaseOrder={item.purchaseOrder} />
          ) : null
        ) : (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 bg-muted/40 py-1 pe-1.5 ps-3 text-xs">
            <OfferingThumbnail
              className="size-5"
              kind={item.job.offeringKind}
              label={item.job.displayName}
              preview={false}
              size="sm"
              thumbnailDataUrl={item.job.thumbnailDataUrl}
            />
            <JobLabel job={item.job} />
            {item.purchaseOrder ? (
              <PurchaseOrderMarker canRead={canReadPurchaseOrder} purchaseOrder={item.purchaseOrder} />
            ) : null}
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
        )
      }
      text={item.feedback.text}
    />
  </FeedbackTimelineEntry>
);

/**
 * What was done, in two flat lines beside a hollow node: who did what, then which Job it happened
 * to. No bubble and no clamp — a change event carries compact facts, never a paragraph, and
 * the quieter shape is what lets a reader skim past a run of them to the next thing someone said.
 */
const JobChangeEntry: React.FC<{ hideDetail: boolean; item: JobChangeActivityItem }> = ({ hideDetail, item }) => {
  const { actorName, detail, sentence, tone } = presentJobActivityEvent(item);
  const Icon = jobActivityEventIcons[item.type];
  const iconTone = statusBadgeColorClassNames[tone];

  return (
    <ActivityRow
      dense
      item={item}
      linkToJob={!hideDetail}
      marker={<ActivityEventMarker />}
      who={
        <span
          className={cn('flex size-8 items-center justify-center rounded-full border', iconTone.chip, iconTone.text)}
        >
          <Icon aria-hidden className="size-3.5" />
        </span>
      }
    >
      <div className="min-w-0">
        <p className="truncate text-sm leading-6">
          <span className="font-medium text-sm">{actorName}</span> {sentence}
        </p>
        {!hideDetail || detail !== null ? (
          <p className="flex min-w-0 items-center gap-x-2 text-sm leading-6 text-muted-foreground">
            {hideDetail ? null : (
              <OfferingThumbnail
                className="size-5"
                kind={item.job.offeringKind}
                label={item.job.displayName}
                preview={false}
                size="sm"
                thumbnailDataUrl={item.job.thumbnailDataUrl}
              />
            )}
            {hideDetail ? null : <JobLabel className="text-sm" job={item.job} />}
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

const jobActivityEventIcons = {
  'job-completed': IconCheck,
  'job-created': IconPlus,
  'job-description-updated': IconPencil,
  'job-document-added': IconFileText,
  'job-work-time-updated': IconClock,
} satisfies Record<JobChangeActivityItem['type'], React.ElementType>;

/** The shared entry shell, linked as a whole to the Job Sheet unless the feed already sits on that Job. */
const ActivityRow: React.FC<{
  children: React.ReactNode;
  dense?: boolean;
  item: JobActivityItem;
  linkToJob: boolean;
  marker: React.ReactNode;
  who: React.ReactNode;
}> = ({ children, dense = false, item, linkToJob, marker, who }) => (
  <ActivityEntryShell
    dense={dense}
    link={
      linkToJob ? (
        <Link
          aria-label={`Open ${formatJobLabel(item.job)}`}
          className={activityEntryLinkClassName}
          search={{ job: item.job.id }}
          to="/equipment/jobs/activity"
        />
      ) : null
    }
    marker={marker}
    occurredAt={item.occurredAt}
    who={who}
  >
    {children}
  </ActivityEntryShell>
);

/** Which Job an entry is about: its code, then what is being built. */
const JobLabel: React.FC<{ className?: string; job: JobActivityItem['job'] }> = ({ className, job }) => (
  <>
    <span className={cn('shrink-0 font-mono font-medium text-muted-foreground', className)}>{job.code}</span>
    <span className={cn('min-w-0 truncate text-muted-foreground', className)}>{job.displayName}</span>
  </>
);

const GanttButton: React.FC<{ job: JobActivityItem['job'] }> = ({ job }) => (
  <Button
    aria-label={`Open ${formatJobLabel(job)} on the Gantt`}
    className="relative z-10 shrink-0"
    render={<Link search={{ job: job.id }} to="/equipment/jobs" />}
    size="icon"
    variant="ghost"
  >
    <IconSubtask />
  </Button>
);

function formatJobLabel(job: JobActivityItem['job']): string {
  return `${job.code} · ${job.displayName}`;
}

const PurchaseOrderMarker: React.FC<{ canRead: boolean; purchaseOrder: FeedbackPurchaseOrder }> = ({
  canRead,
  purchaseOrder,
}) => {
  const content = (
    <>
      <IconShoppingCart aria-hidden className="size-3.5" />
      {formatPurchaseOrderCode(purchaseOrder.code)} · {purchaseOrder.supplierName}
    </>
  );
  const className =
    'relative z-10 inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200';
  return canRead ? (
    <Link className={className} params={{ id: purchaseOrder.id }} to="/equipment/purchase-orders/$id">
      {content}
    </Link>
  ) : (
    <span className={className}>{content}</span>
  );
};
