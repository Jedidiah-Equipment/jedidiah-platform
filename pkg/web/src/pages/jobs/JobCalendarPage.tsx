import { formatDate, hasPermission } from '@pkg/domain';
import type { OffDay } from '@pkg/schema';
import { IconCalendarCheck, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import {
  CalendarBody,
  CalendarDate,
  CalendarDatePagination,
  type CalendarFeature,
  CalendarHeader,
  CalendarItem,
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
  const features = useMemo(
    () =>
      offDays.map(
        (offDay): CalendarFeature => ({
          date: parseDateColumn(offDay.date),
          id: offDay.date,
          name: offDay.label ?? 'Off-Day',
          status: {
            color: 'var(--destructive)',
            name: 'Off-Day',
          },
        }),
      ),
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
        <CalendarBody features={features}>
          {({ date, features, isCurrentMonth }) => {
            const dateKey = formatDateOnly(date);
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
                  {format(date, 'd')}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  {features.slice(0, 3).map((feature) => (
                    <CalendarItem className="bg-destructive/10 text-destructive" feature={feature} key={feature.id} />
                  ))}
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
                    date: formatDateOnly(selectedDay.date),
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
                  date: formatDateOnly(selectedDay.date),
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

function formatDateOnly(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function parseDateColumn(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid date-only value: ${value}`);
  }

  // These Date objects drive local browser calendar columns; the API date key remains authoritative.
  return new Date(year, month - 1, day);
}

function isToday(date: Date): boolean {
  return formatDateOnly(date) === formatDateOnly(new Date());
}
