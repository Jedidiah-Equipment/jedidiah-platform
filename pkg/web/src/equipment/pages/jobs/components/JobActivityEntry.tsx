import { getFirstName } from '@pkg/domain';
import { presentJobActivityEvent } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import type { JobActivityItem, JobChangeActivityItem } from '@pkg/schema/equipment';
import {
  IconCheck,
  IconClock,
  IconFileText,
  IconPencil,
  IconPlus,
  IconSubtask,
  type TablerIcon,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import {
  ActivityEventEntry,
  ActivityNoteEntry,
  ActivityNoteFooter,
  activityNoteFooterLinkClassName,
} from '@/components/activity/ActivityEntries.js';
import { activityEntryLinkClassName } from '@/components/activity/ActivityEntryShell.js';
import { Button } from '@/components/ui/button.js';
import { Separator } from '@/components/ui/separator.js';
import { StockBadge } from '@/equipment/components/common/StockBadge.js';
import { PurchaseOrderFeedbackMarker } from '@/equipment/components/feedback/PurchaseOrderFeedbackMarker.js';
import { OfferingThumbnail } from '@/equipment/components/thumbnail/OfferingThumbnail.js';
import { cn } from '@/lib/utils.js';

type Job = JobActivityItem['job'];

/**
 * One Equipment feed entry: General Feedback as a bubble from its submitter, every Job change as one sentence. Inside
 * a Job's own thread (`jobId`) the entry stops naming and linking that Job.
 */
export const JobActivityEntry: React.FC<{
  canReadPurchaseOrder?: boolean;
  item: JobActivityItem;
  jobId?: UUID | undefined;
}> = ({ canReadPurchaseOrder = false, item, jobId }) => {
  const elsewhere = item.job.id !== jobId;

  if (item.type === 'general-feedback') {
    const purchaseOrder = item.purchaseOrder ? (
      <PurchaseOrderFeedbackMarker canRead={canReadPurchaseOrder} purchaseOrder={item.purchaseOrder} />
    ) : null;
    return (
      <ActivityNoteEntry
        author={{
          name: getFirstName(item.feedback.submitter.name),
          thumbnailDataUrl: item.feedback.submitter.thumbnailDataUrl,
        }}
        footer={
          elsewhere ? (
            <ActivityNoteFooter>
              <Link
                aria-label={`Open ${formatJobLabel(item.job)}`}
                className={cn('flex min-w-0 items-center gap-2', activityNoteFooterLinkClassName)}
                search={{ job: item.job.id }}
                to="/equipment/jobs/activity"
              >
                <JobReference job={item.job} />
              </Link>
              {purchaseOrder}
              <span className="ms-auto flex shrink-0 items-center gap-1.5">
                {item.job.customerCompanyName ? (
                  <span className="truncate">{item.job.customerCompanyName}</span>
                ) : (
                  <StockBadge />
                )}
                <Separator className="h-4 self-center" orientation="vertical" />
                <GanttButton job={item.job} />
              </span>
            </ActivityNoteFooter>
          ) : purchaseOrder ? (
            <ActivityNoteFooter>{purchaseOrder}</ActivityNoteFooter>
          ) : null
        }
        occurredAt={item.occurredAt}
        text={item.feedback.text}
      />
    );
  }

  return (
    <ActivityEventEntry
      context={
        elsewhere ? (
          <p className="flex min-w-0 items-center gap-2 text-sm leading-6 text-muted-foreground">
            <JobReference job={item.job} />
            <GanttButton job={item.job} />
          </p>
        ) : null
      }
      icon={jobActivityEventIcons[item.type]}
      link={
        elsewhere ? (
          <Link
            aria-label={`Open ${formatJobLabel(item.job)}`}
            className={activityEntryLinkClassName}
            search={{ job: item.job.id }}
            to="/equipment/jobs/activity"
          />
        ) : null
      }
      occurredAt={item.occurredAt}
      presentation={presentJobActivityEvent(item)}
    />
  );
};

const jobActivityEventIcons = {
  'job-completed': IconCheck,
  'job-created': IconPlus,
  'job-description-updated': IconPencil,
  'job-document-added': IconFileText,
  'job-work-time-updated': IconClock,
} satisfies Record<JobChangeActivityItem['type'], TablerIcon>;

/** Which Job an entry is about: what is being built, its code, then its name. */
const JobReference: React.FC<{ job: Job }> = ({ job }) => (
  <>
    <OfferingThumbnail
      className="size-5"
      kind={job.offeringKind}
      label={job.displayName}
      preview={false}
      size="sm"
      thumbnailDataUrl={job.thumbnailDataUrl}
    />
    <span className="shrink-0 font-mono font-medium">{job.code}</span>
    <span className="min-w-0 truncate">{job.displayName}</span>
  </>
);

const GanttButton: React.FC<{ job: Job }> = ({ job }) => (
  <Button
    aria-label={`Open ${formatJobLabel(job)} on the Gantt`}
    className="relative z-10 shrink-0"
    render={<Link search={{ job: job.id }} to="/equipment/jobs" />}
    size="icon-xs"
    variant="ghost"
  >
    <IconSubtask />
  </Button>
);

function formatJobLabel(job: Job): string {
  return `${job.code} · ${job.displayName}`;
}
