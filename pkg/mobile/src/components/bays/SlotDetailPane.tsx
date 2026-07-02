import { formatDate, statusDaysLeftColor } from '@pkg/domain';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { JobAssemblies } from '@/components/bays/JobAssemblies';
import { JobDocuments } from '@/components/bays/JobDocuments';
import { FactCard, FactField, FactRow, JobFactsCard } from '@/components/bays/job-facts';
import { DaysLeftChip, StatusChip } from '@/components/bays/status-chip';
import { GiveFeedbackButton } from '@/components/feedback/GiveFeedbackButton';
import { Text } from '@/components/ui/text';
import type { BaySlotDetail } from '@/lib/use-bay-schedule';
import { useColorMode } from '@/theme/use-color-mode';

/**
 * The read-only Job Slot detail pane (#520): status chip(s), a product card, the
 * DOCUMENTS list (the viewer it opens lands in #521), and the SLOT and JOB field
 * grids. Slot + Job fields ride the Board join via {@link BaySlotDetail};
 * documents are fetched here with `jobs.get`, with their own loading/error state.
 */
export function SlotDetailPane({ slot }: { slot: BaySlotDetail }) {
  const isActive = slot.status === 'in-progress';
  const { resolved } = useColorMode();
  const daysLeftColor =
    slot.remainingWorkDays !== null
      ? statusDaysLeftColor({ status: slot.status, daysLeft: slot.remainingWorkDays, scheme: resolved })
      : null;

  return (
    <View className="gap-4">
      {/* Status chip(s): IN PROGRESS / SCHEDULED, plus 'N WORKING DAYS LEFT' while running. The
          SCHEDULED chip matches its timeline card — green for the 'next' Slot, grey otherwise. */}
      <View className="flex-row items-center gap-2">
        <StatusChip
          label={isActive ? 'IN PROGRESS' : 'SCHEDULED'}
          tone={isActive ? 'in-progress' : slot.isNext ? 'next' : 'muted'}
        />
        {slot.remainingWorkDays !== null && daysLeftColor ? (
          <DaysLeftChip color={daysLeftColor} daysLeft={slot.remainingWorkDays} />
        ) : null}
      </View>

      {/* Product card. */}
      <View className="flex-row items-center gap-3.5 rounded-2xl border border-border bg-surface p-3.5">
        <Avatar className="h-[52px] w-[52px] rounded-xl" name={slot.productName} uri={slot.productThumbnailDataUrl} />
        <View className="min-w-0 flex-1">
          <Text className="text-base text-surface-foreground" weight="bold" numberOfLines={1}>
            {slot.productName}
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground" mono>
            {slot.productSerialNumber}
          </Text>
          {slot.customerCompanyName ? (
            <Text className="mt-1 text-sm text-surface-foreground" numberOfLines={1}>
              {slot.customerCompanyName}
            </Text>
          ) : null}
        </View>
      </View>

      {/* DOCUMENTS — opens the in-app viewer (#521); read-only here. */}
      <JobDocuments jobId={slot.jobId} />

      {/* ASSEMBLIES — standard + the optional assemblies selected for this job. */}
      <JobAssemblies jobId={slot.jobId} />

      {/* SLOT grid. */}
      <FactCard title="SLOT">
        <View className="gap-4">
          <FactRow>
            <FactField label="SLOT START" value={formatDate(slot.startDate, 'd MMM yyyy')} />
            <FactField label="SLOT END" value={formatDate(slot.lastWorkDay, 'd MMM yyyy')} />
          </FactRow>
          <FactRow>
            <FactField label="WORK DAYS" value={`${slot.workDays} ${slot.workDays === 1 ? 'day' : 'days'}`} />
            <FactField label="BAY" value={slot.bayName} />
          </FactRow>
        </View>
      </FactCard>

      {/* JOB grid. */}
      <JobFactsCard
        customerCompanyName={slot.customerCompanyName}
        jobCode={slot.jobCode}
        productName={slot.productName}
        productSerialNumber={slot.productSerialNumber}
        quoteCode={slot.quoteCode}
      />

      <GiveFeedbackButton jobCode={slot.jobCode} jobId={slot.jobId} />
    </View>
  );
}
