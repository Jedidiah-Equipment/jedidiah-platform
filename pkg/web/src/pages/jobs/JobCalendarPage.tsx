import { formatDate, hasPermission } from '@pkg/domain';
import type { OffDay } from '@pkg/schema';
import { IconCalendarCheck, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo, useState } from 'react';
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
import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { toJobCalendarDateKey } from './components/job-date-key.js';

type SelectedCalendarDay = {
  date: Date;
  offDay: OffDay | null;
};

export const JobCalendarPage: React.FC = () => {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const offDays = baysQuery.data?.offDays ?? [];
  const offDaysByDate = useMemo(
    () => new Map<string, OffDay>(offDays.map((offDay) => [offDay.date, offDay])),
    [offDays],
  );
  const canEditCalendar = hasPermission(accessQuery.data, 'job:update-calendar');
  const [selectedDay, setSelectedDay] = useState<SelectedCalendarDay | null>(null);
  const [label, setLabel] = useState('');
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

  if (baysQuery.isLoading) {
    return (
      <ListPageLayout description="Production" title="Job Calendar">
        <Skeleton className="h-[640px] w-full" />
      </ListPageLayout>
    );
  }

  if (baysQuery.error) {
    return (
      <ListPageLayout description="Production" title="Job Calendar">
        <ErrorMessage error={baysQuery.error} fallbackMessage="Unable to load Job calendar." />
      </ListPageLayout>
    );
  }

  return (
    <ListPageLayout description="Production" title="Job Calendar">
      <CalendarProvider className="min-h-[640px]">
        <CalendarDate>
          <CalendarMonthLabel />
          <CalendarDatePagination />
        </CalendarDate>
        <CalendarHeader />
        <CalendarBody getDateKey={toJobCalendarDateKey}>
          {({ date, dateKey, isCurrentMonth }) => {
            const offDay = offDaysByDate.get(dateKey) ?? null;

            return (
              <button
                className={cn(
                  'flex h-full w-full flex-col gap-1 p-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  canEditCalendar && 'hover:bg-muted/70',
                  !canEditCalendar && 'cursor-default',
                )}
                disabled={!canEditCalendar}
                onClick={() => {
                  setSelectedDay({ date, offDay });
                  setLabel(offDay?.label ?? '');
                }}
                type="button"
              >
                <span
                  className={cn(
                    'ml-auto flex size-7 items-center justify-center rounded-sm text-xs',
                    isToday(date) && 'bg-primary text-primary-foreground',
                    !isCurrentMonth && 'text-muted-foreground',
                    offDay && !isToday(date) && 'bg-destructive/10 text-destructive',
                  )}
                >
                  {formatDate(date, 'd')}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  {offDay ? (
                    <div className="flex min-w-0 items-center gap-1.5 rounded-sm bg-destructive/10 px-1.5 py-1 text-destructive text-xs">
                      <div className="size-1.5 shrink-0 rounded-full bg-destructive" />
                      <span className="truncate">{offDay.label ?? 'Off-Day'}</span>
                    </div>
                  ) : null}
                </div>
              </button>
            );
          }}
        </CalendarBody>
      </CalendarProvider>
      <Dialog onOpenChange={(open) => !open && setSelectedDay(null)} open={selectedDay !== null}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedDay?.offDay ? 'Edit Off-Day' : 'Mark Off-Day'}</DialogTitle>
            <DialogDescription>{selectedDay ? formatDate(selectedDay.date, 'PPP') : null}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="job-calendar-label">Reason</FieldLabel>
            <Input
              disabled={toggleOffDayMutation.isPending}
              id="job-calendar-label"
              onChange={(event) => setLabel(event.currentTarget.value)}
              value={label}
            />
          </Field>
          <DialogFooter>
            <DialogClose render={<Button disabled={toggleOffDayMutation.isPending} type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            {selectedDay?.offDay ? (
              <Button
                disabled={toggleOffDayMutation.isPending}
                onClick={() => {
                  if (!selectedDay) return;

                  toggleOffDayMutation.mutate({
                    date: toJobCalendarDateKey(selectedDay.date),
                    isOffDay: false,
                    label: null,
                  });
                }}
                type="button"
                variant="outline"
              >
                Working Day
              </Button>
            ) : null}
            <Button
              disabled={toggleOffDayMutation.isPending}
              onClick={() => {
                if (!selectedDay) return;

                toggleOffDayMutation.mutate({
                  date: toJobCalendarDateKey(selectedDay.date),
                  isOffDay: true,
                  label,
                });
              }}
              type="button"
            >
              {toggleOffDayMutation.isPending ? (
                <IconLoader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <IconCalendarCheck data-icon="inline-start" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageLayout>
  );
};

function isToday(date: Date): boolean {
  return toJobCalendarDateKey(date) === toJobCalendarDateKey(new Date());
}
