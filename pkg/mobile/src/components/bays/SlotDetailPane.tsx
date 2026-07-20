import { formatDate, jobStatusAccentColor, resolveJobStatusTone } from '@pkg/domain';
import { View } from 'react-native';

import { JobDetailSections } from '@/components/bays/JobDetailSections';
import { JobWorkCard } from '@/components/bays/JobWorkCard';
import { FactCard, FactField, FactRow } from '@/components/bays/job-facts';
import { DaysLeftChip, StatusChip } from '@/components/bays/status-chip';
import type { BaySlotDetail } from '@/lib/use-bay-schedule';
import { useColorMode } from '@/theme/use-color-mode';

/**
 * The read-only Job Slot detail pane (#520): status chip(s), a product card, the Slot facts,
 * and the shared Job detail sections. Slot + Job fields ride the Board join via
 * {@link BaySlotDetail}; documents/assemblies fetch their own `jobs.get` detail.
 */
export function SlotDetailPane({ slot }: { slot: BaySlotDetail }) {
  const isActive = slot.status === 'in-progress' && !slot.isCancelled;
  const isDone = slot.status === 'done' && !slot.isCancelled;
  const { resolved } = useColorMode();
  const daysLeftColor =
    slot.remainingWorkDays !== null && slot.status !== 'done'
      ? jobStatusAccentColor(
          resolveJobStatusTone({ isNext: slot.isNext, status: isActive ? 'in-progress' : 'scheduled' }),
          resolved,
        )
      : null;

  return (
    <View className="gap-4">
      {/* Status chip(s): IN PROGRESS / SCHEDULED, plus 'N WORKING DAYS LEFT' while running. The
          SCHEDULED chip matches its timeline card — green for the 'next' Slot, grey otherwise. */}
      <View className="flex-row items-center gap-2">
        <StatusChip
          label={slot.isCancelled ? 'CANCELLED' : isActive ? 'IN PROGRESS' : isDone ? 'DONE' : 'SCHEDULED'}
          tone={isActive ? 'in-progress' : slot.isCancelled ? 'muted' : slot.isNext ? 'next' : 'muted'}
        />
        {!slot.isCancelled && slot.remainingWorkDays !== null && daysLeftColor ? (
          <DaysLeftChip color={daysLeftColor} daysLeft={slot.remainingWorkDays} />
        ) : null}
      </View>

      <JobWorkCard
        customerCompanyName={slot.customerCompanyName}
        jobDisplayName={slot.jobDisplayName}
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
        jobId={slot.jobId}
        workName={slot.jobDisplayName}
        productSerialNumber={slot.productSerialNumber}
        quoteCode={slot.quoteCode}
      />
    </View>
  );
}
