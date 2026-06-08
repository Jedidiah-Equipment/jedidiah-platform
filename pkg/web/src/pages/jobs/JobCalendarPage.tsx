import { formatDate, hasPermission } from '@pkg/domain';
import type { BayCalendarException, BayCalendarExceptionDirection, BaySchedule, OffDay } from '@pkg/schema';
import { IconCalendarCheck, IconLoader2, IconMoon, IconSun, IconTrash } from '@tabler/icons-react';
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu.js';
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { fromJobCalendarDateKey, toJobCalendarDateKey } from './components/job-date-key.js';

type SelectedCalendarDay = {
  date: Date;
  offDay: OffDay | null;
};

type BayExceptionDialogState = {
  bayId: string;
  date: string;
  direction: BayCalendarExceptionDirection;
  existingException: BayCalendarException | null;
  label: string;
};

type BayExceptionChip = {
  bayId: string;
  bayName: string;
  date: string;
  direction: BayCalendarExceptionDirection;
  label: string | null;
};

const visibleBayExceptionLimit = 3;

export const JobCalendarPage: React.FC = () => {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const bays = baysQuery.data?.items ?? [];
  const offDays = baysQuery.data?.offDays ?? [];
  const offDaysByDate = useMemo(
    () => new Map<string, OffDay>(offDays.map((offDay) => [offDay.date, offDay])),
    [offDays],
  );
  const bayExceptionChipsByDate = useMemo(() => groupBayExceptionChipsByDate(bays), [bays]);
  const canEditCalendar = hasPermission(accessQuery.data, 'job:update-calendar');
  const canEditBaySchedule =
    hasPermission(accessQuery.data, 'job:update') || hasPermission(accessQuery.data, 'job-stage:update');
  const [selectedDay, setSelectedDay] = useState<SelectedCalendarDay | null>(null);
  const [bayExceptionDialog, setBayExceptionDialog] = useState<BayExceptionDialogState | null>(null);
  const [label, setLabel] = useState('');
  const selectedExceptionBay = bayExceptionDialog
    ? (bays.find((bay) => bay.id === bayExceptionDialog.bayId) ?? null)
    : null;
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
  const openBayExceptionDialog = (date: string, direction: BayCalendarExceptionDirection) => {
    const bay = bays[0];

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
            const bayExceptionChips = bayExceptionChipsByDate.get(dateKey) ?? [];
            const visibleBayExceptionChips = bayExceptionChips.slice(0, visibleBayExceptionLimit);
            const hiddenBayExceptionCount = bayExceptionChips.length - visibleBayExceptionChips.length;
            const dayButton = (
              <button
                aria-disabled={!canEditCalendar}
                className={cn(
                  'flex h-full w-full flex-col gap-1 p-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  canEditCalendar && 'hover:bg-muted/70',
                  !canEditCalendar && 'cursor-default',
                )}
                onClick={() => {
                  if (!canEditCalendar) {
                    return;
                  }

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
                    <div
                      className="flex min-w-0 items-center gap-1.5 rounded-sm bg-destructive/10 px-1.5 py-1 text-destructive text-xs"
                      title={`${formatDate(date, 'PPP')}${offDay.label ? `: ${offDay.label}` : ''}`}
                    >
                      <div className="size-1.5 shrink-0 rounded-full bg-destructive" />
                      <span className="truncate">{offDay.label ?? 'Off-Day'}</span>
                    </div>
                  ) : null}
                  {visibleBayExceptionChips.map((exception) => (
                    <BayExceptionCalendarChip exception={exception} key={`${exception.bayId}-${exception.date}`} />
                  ))}
                  {hiddenBayExceptionCount > 0 ? (
                    <div className="rounded-sm bg-muted px-1.5 py-1 text-muted-foreground text-xs">
                      +{hiddenBayExceptionCount} more
                    </div>
                  ) : null}
                </div>
              </button>
            );

            if (!canEditBaySchedule) {
              return dayButton;
            }

            return (
              <ContextMenu>
                <ContextMenuTrigger render={dayButton} />
                <ContextMenuContent>
                  <ContextMenuGroup>
                    <ContextMenuItem
                      disabled={isBayExceptionMutationPending || bays.length === 0}
                      onClick={() => openBayExceptionDialog(dateKey, 'work')}
                    >
                      <IconSun />
                      Add bay overtime
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={isBayExceptionMutationPending || bays.length === 0}
                      onClick={() => openBayExceptionDialog(dateKey, 'off')}
                    >
                      <IconMoon />
                      Add bay closure
                    </ContextMenuItem>
                  </ContextMenuGroup>
                </ContextMenuContent>
              </ContextMenu>
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
      <Dialog onOpenChange={(open) => !open && setBayExceptionDialog(null)} open={bayExceptionDialog !== null}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bayExceptionDialog?.direction === 'work' ? 'Add bay overtime' : 'Add bay closure'}
            </DialogTitle>
            <DialogDescription>
              {bayExceptionDialog ? formatDate(fromJobCalendarDateKey(bayExceptionDialog.date), 'PPP') : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="bay-exception-bay">Bay</FieldLabel>
              <Select
                disabled={isBayExceptionMutationPending}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }

                  setBayExceptionDialog((current) => {
                    if (!current) return current;

                    const bay = bays.find((item) => item.id === value);
                    const existingException = bay ? getBayCalendarException(bay, current.date) : null;

                    return {
                      ...current,
                      bayId: value,
                      existingException,
                      label: existingException?.label ?? '',
                    };
                  });
                }}
                value={bayExceptionDialog?.bayId ?? ''}
              >
                <SelectTrigger id="bay-exception-bay" className="w-full">
                  <SelectValue placeholder="Select bay">{selectedExceptionBay?.name ?? null}</SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {bays.map((bay) => (
                      <SelectItem key={bay.id} value={bay.id}>
                        {bay.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="bay-exception-label">Reason</FieldLabel>
              <Input
                disabled={isBayExceptionMutationPending}
                id="bay-exception-label"
                onChange={(event) => {
                  const nextLabel = event.currentTarget.value;

                  setBayExceptionDialog((current) => (current ? { ...current, label: nextLabel } : current));
                }}
                value={bayExceptionDialog?.label ?? ''}
              />
            </Field>
          </div>
          <DialogFooter>
            <DialogClose render={<Button disabled={isBayExceptionMutationPending} type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            {bayExceptionDialog?.existingException ? (
              <Button
                disabled={isBayExceptionMutationPending}
                onClick={() => {
                  if (!bayExceptionDialog) return;

                  removeBayExceptionMutation.mutate({
                    bayId: bayExceptionDialog.bayId,
                    date: bayExceptionDialog.date,
                  });
                }}
                type="button"
                variant="outline"
              >
                {removeBayExceptionMutation.isPending ? (
                  <IconLoader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <IconTrash data-icon="inline-start" />
                )}
                Remove exception
              </Button>
            ) : null}
            <Button
              disabled={isBayExceptionMutationPending || !bayExceptionDialog}
              onClick={() => {
                if (!bayExceptionDialog) return;

                addBayExceptionMutation.mutate({
                  bayId: bayExceptionDialog.bayId,
                  date: bayExceptionDialog.date,
                  direction: bayExceptionDialog.direction,
                  label: bayExceptionDialog.label,
                });
              }}
              type="button"
            >
              {addBayExceptionMutation.isPending ? (
                <IconLoader2 className="animate-spin" data-icon="inline-start" />
              ) : bayExceptionDialog?.direction === 'work' ? (
                <IconSun data-icon="inline-start" />
              ) : (
                <IconMoon data-icon="inline-start" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageLayout>
  );
};

const BayExceptionCalendarChip: React.FC<{
  exception: BayExceptionChip;
}> = ({ exception }) => {
  const isOvertime = exception.direction === 'work';
  const label = `${exception.bayName}: ${isOvertime ? 'Overtime' : 'Closure'}`;

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs',
        isOvertime ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700',
      )}
      title={`${label}${exception.label ? `: ${exception.label}` : ''}`}
    >
      {isOvertime ? <IconSun className="size-3 shrink-0" /> : <IconMoon className="size-3 shrink-0" />}
      <span className="truncate">{label}</span>
    </div>
  );
};

function isToday(date: Date): boolean {
  return toJobCalendarDateKey(date) === toJobCalendarDateKey(new Date());
}

function groupBayExceptionChipsByDate(bays: BaySchedule[]): Map<string, BayExceptionChip[]> {
  const chipsByDate = new Map<string, BayExceptionChip[]>();

  for (const bay of bays) {
    for (const exception of bay.calendarExceptions) {
      const chips = chipsByDate.get(exception.date) ?? [];

      chips.push({
        bayId: bay.id,
        bayName: bay.name,
        date: exception.date,
        direction: exception.direction,
        label: exception.label,
      });
      chipsByDate.set(exception.date, chips);
    }
  }

  return chipsByDate;
}

function getBayCalendarException(bay: BaySchedule, date: string): BayCalendarException | null {
  return bay.calendarExceptions.find((exception) => exception.date === date) ?? null;
}
