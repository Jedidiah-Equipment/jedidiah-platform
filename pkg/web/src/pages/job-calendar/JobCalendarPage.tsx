import { canScheduleBay, hasPermission } from '@pkg/domain';
import type { BayCalendarExceptionDirection, OffDay } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import {
  CalendarBody,
  CalendarDate,
  CalendarDatePagination,
  CalendarHeader,
  CalendarMonthLabel,
  CalendarProvider,
} from '@/components/kibo-ui/calendar/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { jobCalendarPageDescription } from '@/utils/page-descriptions.js';
import { toJobCalendarDateKey } from '../jobs/components/job-date-key.js';
import { getBayCalendarException, groupBayExceptionChipsByDate } from './bay-exceptions.js';
import { BayExceptionDialog } from './components/BayExceptionDialog.js';
import { JobCalendarDayCell } from './components/JobCalendarDayCell.js';
import { OffDayDialog } from './components/OffDayDialog.js';
import type { BayExceptionChip, BayExceptionDialogState, SelectedCalendarDay } from './types.js';

export const JobCalendarPage: React.FC = () => {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const enabledBaysQuery = useQuery(trpc.jobs.listJobBays.queryOptions({ filters: { isDisabled: false } }));
  const bays = baysQuery.data?.items ?? [];
  const enabledBayIds = useMemo(
    () => new Set((enabledBaysQuery.data?.items ?? []).map((bay) => bay.id)),
    [enabledBaysQuery.data?.items],
  );
  const schedulableBays = useMemo(
    () => bays.filter((bay) => enabledBayIds.has(bay.id) && canScheduleBay(accessQuery.data)),
    [accessQuery.data, bays, enabledBayIds],
  );
  const schedulableBayIds = useMemo(() => new Set(schedulableBays.map((bay) => bay.id)), [schedulableBays]);
  const offDays = baysQuery.data?.offDays ?? [];
  const offDaysByDate = useMemo(
    () => new Map<string, OffDay>(offDays.map((offDay) => [offDay.date, offDay])),
    [offDays],
  );
  const bayExceptionChipsByDate = useMemo(() => groupBayExceptionChipsByDate(bays), [bays]);
  const canEditCalendar = hasPermission(accessQuery.data, 'job:update-calendar');
  const canEditBaySchedule = schedulableBays.length > 0;
  const [selectedDay, setSelectedDay] = useState<SelectedCalendarDay | null>(null);
  const [bayExceptionDialog, setBayExceptionDialog] = useState<BayExceptionDialogState | null>(null);
  const toggleOffDayMutation = useMutation(
    trpc.jobs.toggleOffDay.mutationOptions({
      onSuccess: async (_result, variables) => {
        await invalidateJobs();
        toast.success(variables.isOffDay ? 'Off-Day saved' : 'Day marked working');
        setSelectedDay(null);
      },
      onError: (error) => showMutationError(error, 'Unable to update Job calendar.'),
    }),
  );
  const addBayExceptionMutation = useMutation(
    trpc.jobs.addBayException.mutationOptions({
      onSuccess: async (_result, variables) => {
        await invalidateJobs();
        toast.success(variables.direction === 'work' ? 'Bay overtime saved' : 'Bay closure saved');
        setBayExceptionDialog(null);
      },
      onError: (error) => showMutationError(error, 'Unable to update Bay calendar.'),
    }),
  );
  const removeBayExceptionMutation = useMutation(
    trpc.jobs.removeBayException.mutationOptions({
      onSuccess: async () => {
        await invalidateJobs();
        toast.success('Bay exception removed');
        setBayExceptionDialog(null);
      },
      onError: (error) => showMutationError(error, 'Unable to remove Bay exception.'),
    }),
  );
  const isBayExceptionMutationPending = addBayExceptionMutation.isPending || removeBayExceptionMutation.isPending;
  const canEditBayException = useCallback(
    (chip: BayExceptionChip) => schedulableBayIds.has(chip.bayId),
    [schedulableBayIds],
  );
  const openBayExceptionDialog = (date: string, direction: BayCalendarExceptionDirection) => {
    const bay = schedulableBays[0];

    if (!bay) {
      return;
    }

    const existingException = getBayCalendarException(bay, date);

    setBayExceptionDialog({
      bayId: bay.id,
      date,
      direction,
      existingException,
      label: existingException?.label ?? '',
    });
  };
  const openBayExceptionForChip = (chip: BayExceptionChip) => {
    const bay = schedulableBays.find((item) => item.id === chip.bayId);

    if (!bay) {
      return;
    }

    const existingException = getBayCalendarException(bay, chip.date);

    if (!existingException) {
      return;
    }

    setBayExceptionDialog({
      bayId: chip.bayId,
      date: chip.date,
      direction: existingException.direction,
      existingException,
      label: existingException.label ?? '',
    });
  };

  if (baysQuery.isLoading) {
    return (
      <PageLayout description={jobCalendarPageDescription} title="Job Calendar">
        <Skeleton className="h-[640px] w-full" />
      </PageLayout>
    );
  }

  if (baysQuery.error) {
    return (
      <PageLayout description={jobCalendarPageDescription} title="Job Calendar">
        <ErrorMessage error={baysQuery.error} fallbackMessage="Unable to load Job calendar." />
      </PageLayout>
    );
  }

  return (
    <PageLayout description={jobCalendarPageDescription} title="Job Calendar">
      <CalendarProvider className="min-h-[640px]">
        <CalendarDate>
          <CalendarMonthLabel />
          <CalendarDatePagination />
        </CalendarDate>
        <CalendarHeader />
        <CalendarBody getDateKey={toJobCalendarDateKey}>
          {({ date, dateKey, isCurrentMonth }) => (
            <JobCalendarDayCell
              bayExceptionChips={bayExceptionChipsByDate.get(dateKey) ?? []}
              canEditBayException={canEditBayException}
              canEditBaySchedule={canEditBaySchedule}
              canEditCalendar={canEditCalendar}
              date={date}
              hasBays={schedulableBays.length > 0}
              isBayExceptionMutationPending={isBayExceptionMutationPending}
              isCurrentMonth={isCurrentMonth}
              offDay={offDaysByDate.get(dateKey) ?? null}
              onAddBayException={(direction) => openBayExceptionDialog(dateKey, direction)}
              onSelectBayException={openBayExceptionForChip}
              onSelectDay={(selectedDate, offDay) => setSelectedDay({ date: selectedDate, offDay })}
            />
          )}
        </CalendarBody>
      </CalendarProvider>
      <OffDayDialog
        isPending={toggleOffDayMutation.isPending}
        onClose={() => setSelectedDay(null)}
        onMarkWorking={() => {
          if (!selectedDay) return;

          toggleOffDayMutation.mutate({
            date: toJobCalendarDateKey(selectedDay.date),
            isOffDay: false,
            label: null,
          });
        }}
        onSave={(label) => {
          if (!selectedDay) return;

          toggleOffDayMutation.mutate({
            date: toJobCalendarDateKey(selectedDay.date),
            isOffDay: true,
            label,
          });
        }}
        selectedDay={selectedDay}
      />
      <BayExceptionDialog
        bays={schedulableBays}
        isAddPending={addBayExceptionMutation.isPending}
        isPending={isBayExceptionMutationPending}
        isRemovePending={removeBayExceptionMutation.isPending}
        onAdd={() => {
          if (!bayExceptionDialog) return;

          addBayExceptionMutation.mutate({
            bayId: bayExceptionDialog.bayId,
            date: bayExceptionDialog.date,
            direction: bayExceptionDialog.direction,
            label: bayExceptionDialog.label,
          });
        }}
        onChange={setBayExceptionDialog}
        onClose={() => setBayExceptionDialog(null)}
        onRemove={() => {
          if (!bayExceptionDialog) return;

          removeBayExceptionMutation.mutate({
            bayId: bayExceptionDialog.bayId,
            date: bayExceptionDialog.date,
          });
        }}
        state={bayExceptionDialog}
      />
    </PageLayout>
  );
};
