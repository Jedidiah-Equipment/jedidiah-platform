import { getFirstName } from '@pkg/domain';
import { presentJobActivityEvent } from '@pkg/domain/equipment';
import type { JobActivityItem, JobChangeActivityItem } from '@pkg/schema/equipment';
import {
  IconCheck,
  IconClock,
  IconFileText,
  IconPencil,
  IconPlus,
  type Icon as TablerIcon,
} from '@tabler/icons-react-native';
import type { Href } from 'expo-router';
import { View } from 'react-native';
import { ActivityEventEntry, ActivityNoteEntry, ActivityNoteFooter } from '@/components/activity/ActivityEntries';
import { Text } from '@/components/ui/text';
import { CustomerName } from '@/equipment/components/CustomerName';
import { PurchaseOrderFeedbackMarker } from '@/equipment/components/feedback/PurchaseOrderFeedbackMarker';
import { OfferingAvatar } from '@/equipment/components/OfferingAvatar';

type Job = JobActivityItem['job'];

const OPENS_JOB = 'Opens Job details';

/**
 * One Equipment feed entry: General Feedback as a bubble from its submitter, every Job change as one sentence. Inside
 * a Job's own thread (`jobId`) the entry stops naming and linking that Job.
 */
export function JobActivityEntry({ item, jobId, last }: { item: JobActivityItem; jobId?: string; last: boolean }) {
  const elsewhere = item.job.id !== jobId;

  if (item.type === 'general-feedback') {
    return (
      <ActivityNoteEntry
        author={{
          name: getFirstName(item.feedback.submitter.name),
          thumbnailDataUrl: item.feedback.submitter.thumbnailDataUrl,
        }}
        footer={
          <>
            {elsewhere ? (
              <ActivityNoteFooter
                accessibilityHint={OPENS_JOB}
                accessibilityLabel={`Open ${item.job.code} ${item.job.displayName}`}
                href={jobHref(item.job)}
              >
                <JobReference job={item.job} textClassName="text-[11px]" />
                <CustomerName
                  className="max-w-24 shrink text-[11px]"
                  companyName={item.job.customerCompanyName}
                  numberOfLines={1}
                />
              </ActivityNoteFooter>
            ) : null}
            {item.purchaseOrder ? (
              <ActivityNoteFooter>
                <PurchaseOrderFeedbackMarker purchaseOrder={item.purchaseOrder} />
              </ActivityNoteFooter>
            ) : null}
          </>
        }
        last={last}
        occurredAt={item.occurredAt}
        text={item.feedback.text}
      />
    );
  }

  const presentation = presentJobActivityEvent(item);
  return (
    <ActivityEventEntry
      accessibilityHint={OPENS_JOB}
      accessibilityLabel={`${presentation.actorName} ${presentation.sentence} on ${item.job.code}`}
      context={
        elsewhere ? (
          <View className="mt-0.5 min-w-0 flex-row items-center gap-1.5">
            <JobReference job={item.job} textClassName="text-sm" />
          </View>
        ) : null
      }
      href={elsewhere ? jobHref(item.job) : null}
      icon={jobActivityEventIcons[item.type]}
      last={last}
      occurredAt={item.occurredAt}
      presentation={presentation}
    />
  );
}

const jobHref = (job: Job): Href => ({ pathname: '/equipment/jobs/[jobId]', params: { jobId: job.id } });

/** Which Job an entry is about: what is being built, its code, then its name. */
function JobReference({ job, textClassName }: { job: Job; textClassName: string }) {
  return (
    <>
      <OfferingAvatar
        className="h-5 w-5 rounded-md"
        iconSize={11}
        kind={job.offeringKind}
        name={job.displayName}
        uri={job.thumbnailDataUrl}
      />
      <Text className={`shrink-0 text-muted-foreground ${textClassName}`} mono>
        {job.code}
      </Text>
      <Text className={`min-w-0 flex-1 text-muted-foreground ${textClassName}`} numberOfLines={1}>
        {job.displayName}
      </Text>
    </>
  );
}

const jobActivityEventIcons = {
  'job-completed': IconCheck,
  'job-created': IconPlus,
  'job-description-updated': IconPencil,
  'job-document-added': IconFileText,
  'job-work-time-updated': IconClock,
} satisfies Record<JobChangeActivityItem['type'], TablerIcon>;
