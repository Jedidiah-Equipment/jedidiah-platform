import type { Bay, UUID } from '@pkg/schema';
import { DateOnlyIsoString } from '@pkg/schema';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { type DatePickerFieldProps, withFieldGroup } from '@/components/form/index.js';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardSeparator,
  CardTitle,
} from '@/components/ui/card.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyIcon, EmptyTitle } from '@/components/ui/empty.js';
import { Switch } from '@/components/ui/switch.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { AddBaySelect, BayRowCard } from '@/equipment/components/bays/index.js';
import { useTRPC } from '@/lib/trpc.js';

import { createBoardPreviewRequest } from './board-ghosts.js';
import { createBayNonWorkingDateMatcher } from './book-slot-insert-at-date.js';
import {
  type BaySeedScheduling,
  getBaySeedDefaultStartDate,
  getBaySeedRowScheduling,
  type JobBaySeedFormValues,
} from './job-bay-seeds.js';

/** Just enough of a form field to drive the seed row's date picker. */
export type BaySeedStartDateFieldApi = {
  state: { value: string };
  DatePickerField: React.ComponentType<DatePickerFieldProps>;
};

type JobBaySeedsCardProps = {
  baysById: Map<UUID, Bay>;
  baysError: unknown;
  enabledBays: Bay[];
  isPending: boolean;
  onShowAllBaysChange: (showAllBays: boolean) => void;
  scheduling: BaySeedScheduling | null;
  showAllBays: boolean;
  showAllBaysInputId: string;
};

/**
 * Both Job creation flows — from a Quote and as a Stock Build — seed the same Bay queues in the same
 * way, so the rows, their fields, their date bounds, and the split warning live here rather than in
 * either page. It is a field group over `baySeeds` alone, which is what lets each page mount it
 * against its own form root without this card knowing that form's value shape.
 */
export const JobBaySeedsCard = withFieldGroup({
  defaultValues: { baySeeds: [] as JobBaySeedFormValues[] },
  props: {} as JobBaySeedsCardProps,
  render: function JobBaySeedsCardGroup({
    baysById,
    baysError,
    enabledBays,
    group,
    isPending,
    onShowAllBaysChange,
    scheduling,
    showAllBays,
    showAllBaysInputId,
  }) {
    return (
      <group.Field name="baySeeds" mode="array">
        {(baySeedsField) => {
          const selectedBayIds = new Set(baySeedsField.state.value.map((row) => row.bayId));

          return (
            <Card>
              <CardHeader>
                <CardTitle>Assigned Bays</CardTitle>
                <CardDescription>
                  Each row books a Work Slot into that Bay's queue when the Job is created.
                </CardDescription>
                <CardAction className="col-span-2 col-start-1 row-span-1 row-start-3 mt-2 justify-self-stretch sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:justify-self-end">
                  <AddBaySelect
                    bays={enabledBays}
                    beforeSelect={
                      <label
                        className="flex shrink-0 items-center gap-2 text-sm font-medium"
                        htmlFor={showAllBaysInputId}
                      >
                        <Switch
                          checked={showAllBays}
                          disabled={isPending}
                          id={showAllBaysInputId}
                          onCheckedChange={(checked) => onShowAllBaysChange(checked === true)}
                          size="sm"
                        />
                        Show all Bays
                      </label>
                    }
                    disabled={isPending}
                    excludeBayIds={selectedBayIds}
                    onAdd={(bay) =>
                      baySeedsField.pushValue({
                        bayId: bay.id,
                        // Manually added Bays have no Product Bay estimate; start from a sane booking.
                        durationDays: 5,
                        startDate: getBaySeedDefaultStartDate(scheduling, bay.id),
                      })
                    }
                  />
                </CardAction>
              </CardHeader>
              <CardSeparator />
              <CardContent>
                <section className="flex flex-col gap-4">
                  {baysError ? <ErrorMessage error={baysError} fallbackMessage="Unable to load Bays." /> : null}
                  {baySeedsField.state.value.length === 0 ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyIcon />
                        <EmptyTitle>No Bays selected.</EmptyTitle>
                        <EmptyDescription>Select a Bay from the header to add it to the Job.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    // Responsive grid: equal-width seed cards align in columns, as many per row as fit.
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,38rem),1fr))] gap-3">
                      {baySeedsField.state.value.map((row, index) => (
                        <BayRowCard
                          bay={baysById.get(row.bayId)}
                          key={row.bayId}
                          onRemove={() => baySeedsField.removeValue(index)}
                          removeDisabled={isPending}
                          removeLabel={`Remove Bay seed ${index + 1}`}
                          showOperator
                          unavailableHint="Bay must be reselected"
                        >
                          <div className="flex items-center gap-3 self-center">
                            <group.AppField name={`baySeeds[${index}].startDate`}>
                              {(startDateField) => (
                                <BaySeedStartDateControl
                                  bayId={row.bayId}
                                  index={index}
                                  isPending={isPending}
                                  scheduling={scheduling}
                                  startDateField={startDateField}
                                />
                              )}
                            </group.AppField>
                            <group.AppField name={`baySeeds[${index}].durationDays`}>
                              {(durationField) => (
                                <durationField.NumberField
                                  className="w-20"
                                  disabled={isPending}
                                  emptyValue={Number.NaN}
                                  inputMode="numeric"
                                  label="Days"
                                  orientation="horizontal"
                                  placeholder="1"
                                  fieldClassName="self-center *:data-[slot=field-label]:flex-none"
                                />
                              )}
                            </group.AppField>
                          </div>
                        </BayRowCard>
                      ))}
                    </div>
                  )}
                </section>
              </CardContent>
            </Card>
          );
        }}
      </group.Field>
    );
  },
});

const BaySeedStartDateControl: React.FC<{
  bayId: UUID;
  index: number;
  isPending: boolean;
  scheduling: BaySeedScheduling | null;
  startDateField: BaySeedStartDateFieldApi;
}> = ({ bayId, index, isPending, scheduling, startDateField }) => {
  const trpc = useTRPC();
  const startDate = startDateField.state.value;
  const hasScheduleData = Boolean(scheduling?.projectedBayQueuesByBayId.has(bayId));
  const shouldPreviewPlacement = hasScheduleData && DateOnlyIsoString.safeParse(startDate).success;
  const previewRequest = useMemo(
    () =>
      shouldPreviewPlacement
        ? // Placement (append/insert/split position and its split warning) resolves from the picked
          // date against the target Slot, never the inserted seed's own length, so any valid duration
          // works — `1` just clears the preview's "positive integer duration" gate.
          createBoardPreviewRequest([{ bayId, durationDays: 1, startDate }])
        : { input: { seeds: [] } },
    [bayId, shouldPreviewPlacement, startDate],
  );
  const previewQuery = useQuery(
    trpc.jobs.previewSchedule.queryOptions(previewRequest.input, {
      enabled: previewRequest.input.seeds.length === 1,
    }),
  );
  const rowScheduling = getBaySeedRowScheduling(
    scheduling,
    { bayId, startDate },
    previewQuery.data?.placements[0] ?? null,
  );

  if (!rowScheduling) {
    return null;
  }

  return (
    <>
      <startDateField.DatePickerField
        disabled={isPending}
        fieldClassName="w-64 shrink-0 *:data-[slot=field-label]:flex-none"
        isDateDisabled={createBayNonWorkingDateMatcher(rowScheduling.workingCalendar)}
        label="Start"
        maxValue={rowScheduling.bounds.maxValue}
        minValue={rowScheduling.bounds.minValue}
        orientation="horizontal"
      />
      {rowScheduling.splitWarning ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                aria-label={`Bay seed ${index + 1} splits an existing slot`}
                className="text-amber-700 dark:text-amber-300"
                role="img"
              />
            }
          >
            <IconAlertTriangle className="size-4" />
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{rowScheduling.splitWarning}</TooltipContent>
        </Tooltip>
      ) : null}
    </>
  );
};
