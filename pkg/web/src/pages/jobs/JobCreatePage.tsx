import { departmentLabels, JOB_STAGE_PIPELINE } from '@pkg/domain';
import type { Station, UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangleIcon, Loader2Icon } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { BackButton } from '@/components/button/BackButton.js';
import { DatePicker } from '@/components/common/DatePicker.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.js';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxValue,
} from '@/components/ui/combobox.js';
import { Separator } from '@/components/ui/separator.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { ScheduleGantt } from '@/pages/job-detail/components/ScheduleGantt.js';
import { parseScheduleDate } from '@/pages/job-detail/components/schedule-gantt-helpers.js';
import { QuoteProductCombobox } from '@/pages/quotes/components/QuoteProductCombobox.js';
import {
  applySelectedStationsToStages,
  buildCreateJobInput,
  createDefaultStages,
  createEmptyStages,
  formatStageList,
  getInfeasibleMessage,
  getUnconfiguredStages,
  mergeDefaultStages,
  type StageDraft,
  toDateInputValue,
} from './components/create-job-dialog-helpers.js';
import {
  applyCreateScheduleGanttPlannedRangeEdit,
  buildCreateScheduleGanttRows,
} from './components/create-job-schedule-gantt-adapter.js';

type JobCreatePageProps = {
  quoteId: UUID | undefined;
};

type StationComboboxGroup = {
  stage: (typeof JOB_STAGE_PIPELINE)[number]['stage'];
  stations: Station[];
};

const todayInputValue = toDateInputValue(new Date());

export const JobCreatePage: React.FC<JobCreatePageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();
  const [dueDate, setDueDate] = useState('');
  const [productId, setProductId] = useState<UUID | ''>('');
  const [stationSelectionTouched, setStationSelectionTouched] = useState(false);
  const [stages, setStages] = useState<StageDraft[]>(() => createEmptyStages());

  const quoteQuery = useQuery({
    ...trpc.quotes.get.queryOptions({ id: quoteId ?? '' }),
    enabled: Boolean(quoteId),
  });
  const quote = quoteQuery.data ?? null;
  const productQuery = useQuery({
    ...trpc.products.get.queryOptions({ id: productId as UUID }),
    enabled: Boolean(productId),
  });
  const stationsQuery = useQuery(trpc.stations.list.queryOptions({ isActive: true }));

  const selectedProduct = productQuery.data ?? null;
  const stations = stationsQuery.data ?? [];
  const defaultStages = useMemo(
    () =>
      selectedProduct
        ? createDefaultStages({
            createDraftId,
            dueDate: dueDate || todayInputValue,
            product: selectedProduct,
          })
        : createEmptyStages(),
    [dueDate, selectedProduct],
  );
  const scheduleRows = useMemo(() => buildCreateScheduleGanttRows({ stages, stations }), [stages, stations]);
  const selectedStationIds = useMemo(
    () => stages.flatMap((stage) => stage.stationBookings.map((booking) => booking.stationId)),
    [stages],
  );
  const scheduleInitialFallbackDate = useMemo(() => new Date(), []);
  const scheduleInitialDate = parseScheduleDate(dueDate) ?? scheduleInitialFallbackDate;
  const scheduleInitialDateAlignment = dueDate ? 'end' : 'center';
  const infeasibleMessage = getInfeasibleMessage(stages);
  const unconfiguredStages = selectedProduct ? getUnconfiguredStages(selectedProduct) : [];

  const createJobMutation = useMutation(
    trpc.jobs.create.mutationOptions({
      onSuccess: async (job) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.jobs.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() }),
        ]);
        toast.success('Job created');
        await navigate({ params: { id: job.id }, to: '/jobs/$id' });
      },
      onError: (error) => showMutationError(error, 'Unable to create job.'),
    }),
  );

  useEffect(() => {
    if (!quote) return;

    setProductId(quote.productId ?? '');
    setStationSelectionTouched(false);
  }, [quote]);

  useEffect(() => {
    setStages((currentStages) => {
      const mergedStages = mergeDefaultStages(currentStages, defaultStages);
      if (!stationSelectionTouched) return mergedStages;

      return applySelectedStationsToStages({
        createDraftId,
        selectedStationIds: currentStages.flatMap((stage) => stage.stationBookings.map((booking) => booking.stationId)),
        stages: mergedStages,
        stations,
      });
    });
  }, [defaultStages, stationSelectionTouched, stations]);

  const canSubmit =
    Boolean(selectedProduct) && stages.length === JOB_STAGE_PIPELINE.length && !createJobMutation.isPending;
  const title = quote ? `Create job from ${quote.code}` : 'Create job';
  const backTarget = quote ? (
    <BackButton params={{ id: quote.id }} to="/quotes/$id">
      Quote
    </BackButton>
  ) : (
    <BackButton to="/jobs">Jobs</BackButton>
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
      <div>{backTarget}</div>
      <Card className="min-w-0">
        <CardHeader>
          <CardDescription>Production</CardDescription>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <Separator />
          <ErrorMessage error={quoteQuery.error} fallbackMessage="Unable to load quote." />
          {quoteId && quoteQuery.isPending ? <CreateJobPageSkeleton /> : null}
          {!quoteId || quote ? (
            <div className="grid min-w-0 gap-4">
              <div
                className={
                  quote
                    ? 'grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(14rem,1fr)_minmax(12rem,16rem)_minmax(18rem,2fr)]'
                    : 'grid min-w-0 gap-3 md:grid-cols-[minmax(14rem,1fr)_minmax(12rem,16rem)_minmax(18rem,2fr)]'
                }
              >
                {quote ? (
                  <>
                    <ReadOnlyField label="Quote Code" value={quote.code} />
                    <ReadOnlyField label="Customer Name" value={quote.customerCompanyName} />
                  </>
                ) : null}
                <FieldBlock label="Product">
                  <QuoteProductCombobox
                    disabled={createJobMutation.isPending}
                    notifyResolvedSelection={false}
                    onSelected={(product) => {
                      const nextProductId = product?.id ?? '';
                      setProductId((currentProductId) =>
                        currentProductId === nextProductId ? currentProductId : nextProductId,
                      );
                      setStationSelectionTouched(false);
                    }}
                    value={productId}
                  />
                </FieldBlock>
                {selectedProduct ? (
                  <>
                    <FieldBlock label="Job Due Date">
                      <DatePicker clearable onChange={setDueDate} value={dueDate} />
                    </FieldBlock>
                    <FieldBlock label="Stations">
                      <StationMultiCombobox
                        disabled={createJobMutation.isPending}
                        onChange={(nextStationIds) => {
                          setStationSelectionTouched(true);
                          setStages((currentStages) =>
                            applySelectedStationsToStages({
                              createDraftId,
                              selectedStationIds: nextStationIds,
                              stages: currentStages,
                              stations,
                            }),
                          );
                        }}
                        selectedStationIds={selectedStationIds}
                        stations={stations}
                      />
                    </FieldBlock>
                  </>
                ) : null}
              </div>

              {selectedProduct ? (
                <div className="grid min-w-0 gap-4">
                  {infeasibleMessage ? (
                    <WarningBanner title="Schedule warning">{infeasibleMessage}</WarningBanner>
                  ) : null}
                  {unconfiguredStages.length > 0 ? (
                    <WarningBanner title="Product setup warning">
                      Missing duration or default Stations for {formatStageList(unconfiguredStages)}.
                    </WarningBanner>
                  ) : null}

                  <div className="grid min-w-0 gap-3">
                    <ScheduleGantt
                      canEditSchedule={!createJobMutation.isPending}
                      initialDate={scheduleInitialDate}
                      initialDateAlignment={scheduleInitialDateAlignment}
                      mode="create"
                      onEditPlannedRange={(row, nextRange) => {
                        setStages(applyCreateScheduleGanttPlannedRangeEdit({ nextRange, row, stages }));
                      }}
                      rows={scheduleRows}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end gap-2 border-t">
          <Button
            disabled={createJobMutation.isPending}
            onClick={() => {
              if (quote) {
                return void navigate({ params: { id: quote.id }, to: '/quotes/$id' });
              }

              return void navigate({ to: '/jobs' });
            }}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              createJobMutation.mutate(
                buildCreateJobInput({
                  dueDate,
                  productId,
                  quoteId: quote?.id ?? null,
                  stages,
                }),
              )
            }
            type="button"
          >
            {createJobMutation.isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
            Create job
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

const FieldBlock: React.FC<{ children: React.ReactNode; label: string }> = ({ children, label }) => (
  <div className="grid gap-1.5 text-sm font-medium">
    <span>{label}</span>
    {children}
  </div>
);

const ReadOnlyField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="grid gap-1.5 text-sm font-medium">
    <span>{label}</span>
    <div className="min-h-9 rounded-md border bg-muted/40 px-3 py-2 font-normal text-foreground">{value}</div>
  </div>
);

const WarningBanner: React.FC<{ children: React.ReactNode; title: string }> = ({ children, title }) => (
  <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
    <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
    <div className="grid gap-0.5">
      <div className="font-medium">{title}</div>
      <div>{children}</div>
    </div>
  </div>
);

const StationMultiCombobox: React.FC<{
  disabled: boolean;
  onChange: (stationIds: UUID[]) => void;
  selectedStationIds: UUID[];
  stations: Station[];
}> = ({ disabled, onChange, selectedStationIds, stations }) => {
  const stationById = useMemo(() => new Map(stations.map((station) => [station.id, station])), [stations]);
  const stationsByDepartment = useMemo<StationComboboxGroup[]>(
    () =>
      JOB_STAGE_PIPELINE.map(({ stage }) => ({
        stage,
        stations: stations
          .filter((station) => station.department === stage)
          .sort((first, second) => first.displayOrder - second.displayOrder || first.name.localeCompare(second.name)),
      })).filter((group) => group.stations.length > 0),
    [stations],
  );
  const selectedStations = useMemo(
    () => selectedStationIds.flatMap((stationId) => stationById.get(stationId) ?? []),
    [selectedStationIds, stationById],
  );
  const getStationName = useCallback((station: Station) => station.name, []);

  return (
    <Combobox
      disabled={disabled}
      itemToStringValue={getStationName}
      items={stationsByDepartment}
      multiple
      onValueChange={(nextStations) => onChange(nextStations.map((station) => station.id))}
      value={selectedStations}
    >
      <ComboboxChips>
        <ComboboxValue>
          {selectedStations.map((station) => (
            <ComboboxChip key={station.id}>{station.name}</ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput disabled={disabled} placeholder="Select stations..." />
      </ComboboxChips>
      <ComboboxContent>
        <ComboboxEmpty>No Stations found.</ComboboxEmpty>
        <ComboboxList>
          {(group: StationComboboxGroup) => (
            <ComboboxGroup className="block pb-1 last:pb-0" items={group.stations} key={group.stage}>
              <ComboboxLabel>{departmentLabels[group.stage]}</ComboboxLabel>
              <ComboboxCollection>
                {(station) => (
                  <ComboboxItem key={station.id} value={station}>
                    <span className="min-w-0 truncate">{station.name}</span>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
};

function CreateJobPageSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

function createDraftId(): string {
  return globalThis.crypto.randomUUID();
}
