import { computeDefaults, departmentLabels, JOB_STAGE_PIPELINE } from '@pkg/domain';
import type { JobCreateInput, JobStageName, Product, QuoteSummary, Station, UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertTriangleIcon,
  BriefcaseBusinessIcon,
  CalendarDaysIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { QuoteCustomerCombobox, type QuoteCustomerOption } from '@/pages/quotes/components/QuoteCustomerCombobox.js';
import { QuoteProductCombobox } from '@/pages/quotes/components/QuoteProductCombobox.js';

type CreateJobDialogProps = {
  quote?: QuoteSummary;
  trigger: React.ReactElement;
};

type AnchorKind = 'start' | 'end';

type StageDraft = {
  dueEnd: string;
  dueEndSetManually: boolean;
  dueStart: string;
  dueStartSetManually: boolean;
  stage: JobStageName;
  stationBookings: StationBookingDraft[];
};

type StationBookingDraft = {
  dueEnd: string;
  dueEndSetManually: boolean;
  dueStart: string;
  dueStartSetManually: boolean;
  id: string;
  stationId: UUID;
};

const todayInputValue = toDateInputValue(new Date());

export const CreateJobDialog: React.FC<CreateJobDialogProps> = ({ quote, trigger }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();
  const [open, setOpen] = useState(false);
  const [anchorKind, setAnchorKind] = useState<AnchorKind>('end');
  const [anchorDate, setAnchorDate] = useState(todayInputValue);
  const [customerId, setCustomerId] = useState<UUID | ''>(quote?.customerId ?? '');
  const [fallbackCustomer, setFallbackCustomer] = useState<QuoteCustomerOption | null>(getQuoteCustomerOption(quote));
  const [productId, setProductId] = useState<UUID | ''>(quote?.productId ?? '');
  const [stages, setStages] = useState<StageDraft[]>(() => createEmptyStages());

  const productQuery = useQuery({
    ...trpc.products.get.queryOptions({ id: productId || '00000000-0000-4000-8000-000000000000' }),
    enabled: Boolean(productId),
  });
  const stationsQuery = useQuery(trpc.stations.list.queryOptions({ isActive: true }));

  const selectedProduct = productQuery.data ?? null;
  const stations = stationsQuery.data ?? [];
  const defaultStages = useMemo(
    () => (selectedProduct ? createDefaultStages(selectedProduct, anchorKind, anchorDate) : createEmptyStages()),
    [anchorDate, anchorKind, selectedProduct],
  );
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
        setOpen(false);
        await navigate({ params: { id: job.id }, to: '/jobs/$id' });
      },
      onError: (error) => showMutationError(error, 'Unable to create job.'),
    }),
  );

  useEffect(() => {
    if (!open) return;

    setAnchorKind('end');
    setAnchorDate(todayInputValue);
    setCustomerId(quote?.customerId ?? '');
    setFallbackCustomer(getQuoteCustomerOption(quote));
    setProductId(quote?.productId ?? '');
    setStages(createEmptyStages());
  }, [open, quote]);

  useEffect(() => {
    setStages((currentStages) => mergeDefaultStages(currentStages, defaultStages));
  }, [defaultStages]);

  const canSubmit = Boolean(productId) && stages.length === JOB_STAGE_PIPELINE.length && !createJobMutation.isPending;

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{quote ? `Create job from ${quote.code}` : 'Create job'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <FieldBlock label="Customer">
              <QuoteCustomerCombobox
                disabled={createJobMutation.isPending}
                fallbackCustomer={fallbackCustomer}
                onSelected={(customer) => {
                  setCustomerId(customer?.id ?? '');
                  setFallbackCustomer(customer);
                }}
                value={customerId}
              />
            </FieldBlock>
            <FieldBlock label="Product">
              <QuoteProductCombobox
                disabled={createJobMutation.isPending}
                onSelected={(product) => setProductId(product?.id ?? '')}
                value={productId}
              />
            </FieldBlock>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
            <FieldBlock label="Planning anchor">
              <div className="grid grid-cols-2 overflow-hidden rounded-lg border p-1">
                <Button
                  onClick={() => setAnchorKind('start')}
                  size="sm"
                  type="button"
                  variant={anchorKind === 'start' ? 'default' : 'ghost'}
                >
                  Plan from start
                </Button>
                <Button
                  onClick={() => setAnchorKind('end')}
                  size="sm"
                  type="button"
                  variant={anchorKind === 'end' ? 'default' : 'ghost'}
                >
                  Plan from end
                </Button>
              </div>
            </FieldBlock>
            <FieldBlock label={anchorKind === 'start' ? 'Start date' : 'End date'}>
              <Input onChange={(event) => setAnchorDate(event.target.value)} type="date" value={anchorDate} />
            </FieldBlock>
          </div>

          {infeasibleMessage ? <WarningBanner title="Schedule warning">{infeasibleMessage}</WarningBanner> : null}
          {unconfiguredStages.length > 0 ? (
            <WarningBanner title="Product setup warning">
              Missing duration or default Stations for {formatStageList(unconfiguredStages)}.
            </WarningBanner>
          ) : null}

          <div className="grid gap-3">
            {stages.map((stage) => (
              <StageEditor
                defaultStage={defaultStages.find((item) => item.stage === stage.stage) ?? null}
                key={stage.stage}
                onChange={(nextStage) =>
                  setStages((currentStages) =>
                    currentStages.map((currentStage) =>
                      currentStage.stage === nextStage.stage ? nextStage : currentStage,
                    ),
                  )
                }
                stage={stage}
                stations={stations.filter((station) => station.department === stage.stage)}
              />
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button disabled={createJobMutation.isPending} onClick={() => setOpen(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              createJobMutation.mutate(
                buildCreateJobInput({
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const FieldBlock: React.FC<{ children: React.ReactNode; label: string }> = ({ children, label }) => (
  <div className="grid gap-1.5 text-sm font-medium">
    <span>{label}</span>
    {children}
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

const StageEditor: React.FC<{
  defaultStage: StageDraft | null;
  onChange: (stage: StageDraft) => void;
  stage: StageDraft;
  stations: Station[];
}> = ({ defaultStage, onChange, stage, stations }) => {
  const bookedStationIds = new Set(stage.stationBookings.map((booking) => booking.stationId));
  const availableStations = stations.filter((station) => !bookedStationIds.has(station.id));

  return (
    <section className="grid gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{departmentLabels[stage.stage]}</div>
        <Select
          disabled={availableStations.length === 0}
          onValueChange={(stationId) => {
            const station = availableStations.find((item) => item.id === stationId);
            if (!station) return;
            onChange({
              ...stage,
              stationBookings: [
                ...stage.stationBookings,
                {
                  dueEnd: stage.dueEnd,
                  dueEndSetManually: false,
                  dueStart: stage.dueStart,
                  dueStartSetManually: false,
                  id: createDraftId(),
                  stationId: station.id,
                },
              ],
            });
          }}
          value=""
        >
          <SelectTrigger className="w-full sm:w-56" size="sm">
            <PlusIcon className="size-4" />
            <SelectValue placeholder="Add Station" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {availableStations.map((station) => (
                <SelectItem key={station.id} value={station.id}>
                  {station.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <DateEditor
          defaultValue={defaultStage?.dueStart ?? ''}
          label="Stage start"
          onChange={(value, setManually) =>
            onChange({
              ...stage,
              dueStart: value,
              dueStartSetManually: setManually,
              stationBookings: stage.stationBookings.map((booking) =>
                booking.dueStartSetManually ? booking : { ...booking, dueStart: value },
              ),
            })
          }
          setManually={stage.dueStartSetManually}
          value={stage.dueStart}
        />
        <DateEditor
          defaultValue={defaultStage?.dueEnd ?? ''}
          label="Stage end"
          onChange={(value, setManually) =>
            onChange({
              ...stage,
              dueEnd: value,
              dueEndSetManually: setManually,
              stationBookings: stage.stationBookings.map((booking) =>
                booking.dueEndSetManually ? booking : { ...booking, dueEnd: value },
              ),
            })
          }
          setManually={stage.dueEndSetManually}
          value={stage.dueEnd}
        />
      </div>

      <div className="grid gap-2">
        {stage.stationBookings.length === 0 ? (
          <div className="rounded-lg border border-dashed p-2 text-sm text-muted-foreground">No Stations selected</div>
        ) : (
          stage.stationBookings.map((booking) => {
            const station = stations.find((item) => item.id === booking.stationId);
            return (
              <div
                className="grid gap-2 rounded-lg border p-2 md:grid-cols-[minmax(0,1fr)_11rem_11rem_auto]"
                key={booking.id}
              >
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <BriefcaseBusinessIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{station?.name ?? 'Selected Station'}</span>
                </div>
                <DateEditor
                  defaultValue={stage.dueStart}
                  label="Booking start"
                  onChange={(value, setManually) =>
                    onChange({
                      ...stage,
                      stationBookings: stage.stationBookings.map((item) =>
                        item.id === booking.id ? { ...item, dueStart: value, dueStartSetManually: setManually } : item,
                      ),
                    })
                  }
                  setManually={booking.dueStartSetManually}
                  value={booking.dueStart}
                />
                <DateEditor
                  defaultValue={stage.dueEnd}
                  label="Booking end"
                  onChange={(value, setManually) =>
                    onChange({
                      ...stage,
                      stationBookings: stage.stationBookings.map((item) =>
                        item.id === booking.id ? { ...item, dueEnd: value, dueEndSetManually: setManually } : item,
                      ),
                    })
                  }
                  setManually={booking.dueEndSetManually}
                  value={booking.dueEnd}
                />
                <Button
                  aria-label="Remove Station"
                  onClick={() =>
                    onChange({
                      ...stage,
                      stationBookings: stage.stationBookings.filter((item) => item.id !== booking.id),
                    })
                  }
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <Trash2Icon />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};

const DateEditor: React.FC<{
  defaultValue: string;
  label: string;
  onChange: (value: string, setManually: boolean) => void;
  setManually: boolean;
  value: string;
}> = ({ defaultValue, label, onChange, setManually, value }) => {
  const inputId = useId();

  return (
    <div className="grid gap-1 text-xs font-medium text-muted-foreground">
      <label className="flex items-center gap-1" htmlFor={inputId}>
        <CalendarDaysIcon className="size-3.5" />
        {label}
        {setManually ? <span className="text-foreground">Pinned</span> : null}
      </label>
      <Input
        id={inputId}
        onChange={(event) => onChange(event.target.value, event.target.value !== defaultValue)}
        type="date"
        value={value}
      />
    </div>
  );
};

function createDefaultStages(product: Product, anchorKind: AnchorKind, anchorDate: string): StageDraft[] {
  const result = computeDefaults({
    anchor: {
      kind: anchorKind,
      value: fromDateInputValue(anchorDate),
    },
    productPerDeptConfig: product.departmentConfigs.map((config) => ({
      defaultStationIds: config.defaultStationIds,
      durationDays: config.durationDays,
      stage: config.department,
    })),
  });

  return JOB_STAGE_PIPELINE.map(({ stage }) => {
    const defaultStage = result.stages.find((item) => item.stage === stage);
    if (!defaultStage) return createEmptyStage(stage);

    return {
      dueEnd: toDateInputValue(defaultStage.dueEnd),
      dueEndSetManually: false,
      dueStart: toDateInputValue(defaultStage.dueStart),
      dueStartSetManually: false,
      stage,
      stationBookings: result.stationBookings
        .filter((booking) => booking.stage === stage)
        .map((booking) => ({
          dueEnd: toDateInputValue(booking.dueEnd),
          dueEndSetManually: false,
          dueStart: toDateInputValue(booking.dueStart),
          dueStartSetManually: false,
          id: createDraftId(),
          stationId: booking.stationId,
        })),
    };
  });
}

function mergeDefaultStages(currentStages: StageDraft[], defaultStages: StageDraft[]): StageDraft[] {
  return defaultStages.map((defaultStage) => {
    const currentStage = currentStages.find((stage) => stage.stage === defaultStage.stage);
    if (!currentStage) return defaultStage;

    return {
      ...defaultStage,
      dueEnd: currentStage.dueEndSetManually ? currentStage.dueEnd : defaultStage.dueEnd,
      dueEndSetManually: currentStage.dueEndSetManually,
      dueStart: currentStage.dueStartSetManually ? currentStage.dueStart : defaultStage.dueStart,
      dueStartSetManually: currentStage.dueStartSetManually,
      stationBookings: mergeDefaultBookings(currentStage, defaultStage),
    };
  });
}

function mergeDefaultBookings(currentStage: StageDraft, defaultStage: StageDraft): StationBookingDraft[] {
  const currentByStationId = new Map(currentStage.stationBookings.map((booking) => [booking.stationId, booking]));

  return defaultStage.stationBookings.map((defaultBooking) => {
    const currentBooking = currentByStationId.get(defaultBooking.stationId);
    if (!currentBooking) return defaultBooking;

    return {
      ...defaultBooking,
      dueEnd: currentBooking.dueEndSetManually ? currentBooking.dueEnd : defaultBooking.dueEnd,
      dueEndSetManually: currentBooking.dueEndSetManually,
      dueStart: currentBooking.dueStartSetManually ? currentBooking.dueStart : defaultBooking.dueStart,
      dueStartSetManually: currentBooking.dueStartSetManually,
      id: currentBooking.id,
    };
  });
}

function buildCreateJobInput({
  productId,
  quoteId,
  stages,
}: {
  productId: UUID | '';
  quoteId: UUID | null;
  stages: StageDraft[];
}): JobCreateInput {
  if (!productId) {
    throw new Error('Product is required to create a job.');
  }

  const firstStage = stages[0];
  const lastStage = stages[stages.length - 1];

  return {
    dueEnd: lastStage?.dueEnd || null,
    dueEndSetManually: false,
    dueStart: firstStage?.dueStart || null,
    dueStartSetManually: false,
    productId,
    quoteId,
    stages: stages.map((stage) => ({
      dueEnd: stage.dueEnd || null,
      dueEndSetManually: stage.dueEndSetManually,
      dueStart: stage.dueStart || null,
      dueStartSetManually: stage.dueStartSetManually,
      stage: stage.stage,
      stationBookings: stage.stationBookings.map((booking) => ({
        dueEnd: booking.dueEnd || null,
        dueEndSetManually: booking.dueEndSetManually,
        dueStart: booking.dueStart || null,
        dueStartSetManually: booking.dueStartSetManually,
        stationId: booking.stationId,
      })),
    })),
  };
}

function createEmptyStages(): StageDraft[] {
  return JOB_STAGE_PIPELINE.map(({ stage }) => createEmptyStage(stage));
}

function createEmptyStage(stage: JobStageName): StageDraft {
  return {
    dueEnd: '',
    dueEndSetManually: false,
    dueStart: '',
    dueStartSetManually: false,
    stage,
    stationBookings: [],
  };
}

function getUnconfiguredStages(product: Product): JobStageName[] {
  const configsByDepartment = new Map(product.departmentConfigs.map((config) => [config.department, config]));

  return JOB_STAGE_PIPELINE.flatMap(({ stage }) => {
    const config = configsByDepartment.get(stage);
    return !config || config.durationDays === 0 || config.defaultStationIds.length === 0 ? [stage] : [];
  });
}

function getInfeasibleMessage(stages: StageDraft[]): string | null {
  const invertedStage = stages.find(
    (stage) => stage.dueStart && stage.dueEnd && stage.dueStart.localeCompare(stage.dueEnd) > 0,
  );
  if (invertedStage) {
    return `${departmentLabels[invertedStage.stage]} starts after it ends. You can still save, but the dates need attention.`;
  }

  return null;
}

function getQuoteCustomerOption(quote: QuoteSummary | undefined): QuoteCustomerOption | null {
  if (!quote) return null;

  return {
    companyName: quote.customerCompanyName,
    email: null,
    id: quote.customerId,
  };
}

function formatStageList(stages: JobStageName[]): string {
  return stages.map((stage) => departmentLabels[stage]).join(', ');
}

function fromDateInputValue(value: string): Date {
  return new Date(`${value || todayInputValue}T00:00:00.000Z`);
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function createDraftId(): string {
  return globalThis.crypto?.randomUUID() ?? `${Date.now()}-${Math.random()}`;
}
