import { formatDate } from '@pkg/domain';
import { View } from 'react-native';

import { JobDetailSections } from '@/components/bays/JobDetailSections';
import { JobWorkCard } from '@/components/bays/JobWorkCard';
import { FactCard, FactField, FactRow } from '@/components/bays/job-facts';
import { DaysLeftChip, StatusChip } from '@/components/bays/status-chip';
import type { BaySlotDetail } from '@/lib/use-bay-schedule';

/**
 * The read-only Job Slot detail pane (#520): status chip(s), a product card, the Slot facts,
 * and the shared Job detail sections. Slot + Job fields ride the Board join via
 * {@link BaySlotDetail}; documents/assemblies fetch their own `jobs.get` detail.
 */
export function SlotDetailPane({
  jobFactsDefaultOpen = false,
  slot,
}: {
  /** Passed through to JOB DETAILS; the Bay Queue knows whether its toolbar is naming the Job. */
  jobFactsDefaultOpen?: boolean;
  slot: BaySlotDetail;
}) {
  const isActive = slot.status === 'in-progress' && !slot.isCancelled;
  const isDone = slot.status === 'done' && !slot.isCancelled;
  const statusTone = slot.isCancelled ? 'cancelled' : isActive ? 'in-progress' : slot.isNext ? 'next' : 'muted';

  return (
    <View className="gap-4">
      {/* The immediately-next Slot keeps its brighter timeline accent on the timeline and progress cues;
          the badge itself follows the shared mobile status treatment. */}
      <View className="flex-row items-center gap-2">
        <StatusChip
          label={slot.isCancelled ? 'Cancelled' : isActive ? 'In progress' : isDone ? 'Done' : 'Scheduled'}
          tone={statusTone}
        />
        {!slot.isCancelled && slot.remainingWorkDays !== null && slot.status !== 'done' ? (
          <DaysLeftChip daysLeft={slot.remainingWorkDays} tone={statusTone} />
        ) : null}
      </View>

      <JobWorkCard
        customerCompanyName={slot.customerCompanyName}
        jobDisplayName={slot.jobDisplayName}
        offeringKind={slot.offeringKind}
        productSerialNumber={slot.productSerialNumber}
        productThumbnailDataUrl={slot.productThumbnailDataUrl}
      />

      {/* SLOT grid. */}
      <FactCard title="SLOT">
        <View className="gap-4">
          <FactRow>
            <FactField label="SLOT START" value={formatDate(slot.firstWorkDay, 'd MMM yyyy')} />
            <FactField label="SLOT END" value={formatDate(slot.lastWorkDay, 'd MMM yyyy')} />
          </FactRow>
          <FactRow>
            <FactField label="WORK DAYS" value={`${slot.workDays} ${slot.workDays === 1 ? 'day' : 'days'}`} />
            <FactField label="BAY" value={slot.bayName} />
          </FactRow>
        </View>
      </FactCard>

      <JobDetailSections
        customerCompanyName={slot.customerCompanyName}
        description={slot.description}
        jobCode={slot.jobCode}
        jobFactsDefaultOpen={jobFactsDefaultOpen}
        jobId={slot.jobId}
        workName={slot.jobDisplayName}
        productSerialNumber={slot.productSerialNumber}
        quoteCode={slot.quoteCode}
      />
    </View>
  );
}
