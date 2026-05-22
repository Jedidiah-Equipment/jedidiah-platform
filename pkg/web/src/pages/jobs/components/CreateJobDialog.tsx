import { departmentLabels, JOB_STAGE_PIPELINE } from '@pkg/domain';
import type { QuoteSummary, Station, UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangleIcon, BriefcaseBusinessIcon, Loader2Icon, PlusIcon, Trash2Icon } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DatePicker } from '@/components/common/DatePicker.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { ScheduleGantt } from '@/pages/job-detail/components/ScheduleGantt.js';
import { QuoteProductCombobox } from '@/pages/quotes/components/QuoteProductCombobox.js';
import {
  buildCreateJobInput,
  createDefaultStages,
  createEmptyStages,
  formatStageList,
  getInfeasibleMessage,
  getUnconfiguredStages,
  mergeDefaultStages,
  type StageDraft,
  type StationBookingDraft,
  toDateInputValue,
} from './create-job-dialog-helpers.js';
import {
  applyCreateScheduleGanttDueRangeEdit,
  buildCreateScheduleGanttRows,
} from './create-job-schedule-gantt-adapter.js';

type CreateJobDialogProps = {
  quote?: QuoteSummary;
  trigger: React.ReactElement;
};

type AnchorKind = 'start' | 'end';

const todayInputValue = toDateInputValue(new Date());

export const CreateJobDialog: React.FC<CreateJobDialogProps> = ({ quote, trigger }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();
  const [open, setOpen] = useState(false);
  const [anchorKind, setAnchorKind] = useState<AnchorKind>('end');
  const [anchorDate, setAnchorDate] = useState(todayInputValue);
  const [productId, setProductId] = useState<UUID | ''>(quote?.productId ?? '');
  const [stages, setStages] = useState<StageDraft[]>(() => createEmptyStages());

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
            anchorDate,
            anchorKind,
            createDraftId,
            product: selectedProduct,
          })
        : createEmptyStages(),
    [anchorDate, anchorKind, selectedProduct],
  );
  const scheduleRows = useMemo(() => buildCreateScheduleGanttRows({ stages, stations }), [stages, stations]);
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
          <div className={quote ? 'grid gap-3 md:grid-cols-3' : 'grid gap-3'}>
            {quote ? (
              <>
                <ReadOnlyField label="Quote Code" value={quote.code} />
                <ReadOnlyField label="Customer Name" value={quote.customerCompanyName} />
              </>
            ) : null}
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
              <DatePicker onChange={setAnchorDate} value={anchorDate} />
            </FieldBlock>
          </div>

          {infeasibleMessage ? <WarningBanner title="Schedule warning">{infeasibleMessage}</WarningBanner> : null}
          {unconfiguredStages.length > 0 ? (
            <WarningBanner title="Product setup warning">
              Missing duration or default Stations for {formatStageList(unconfiguredStages)}.
            </WarningBanner>
          ) : null}

          <div className="grid gap-3">
            <ScheduleGantt
              canEditSchedule={!createJobMutation.isPending}
              mode="create"
              onEditDueRange={(row, nextRange) => {
                const edit = applyCreateScheduleGanttDueRangeEdit({
                  anchorKind,
                  nextRange,
                  row,
                  stages,
                });

                if (edit.kind === 'anchor') {
                  setAnchorKind(edit.anchorKind);
                  setAnchorDate(edit.anchorDate);
                } else {
                  setStages(edit.stages);
                }
              }}
              rows={scheduleRows}
            />
            {stages.map((stage) => (
              <StageEditor
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
                  anchorKind,
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

const StageEditor: React.FC<{
  onChange: (stage: StageDraft) => void;
  stage: StageDraft;
  stations: Station[];
}> = ({ onChange, stage, stations }) => {
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
                createStationBookingDraft({
                  dueEnd: stage.dueEnd,
                  dueStart: stage.dueStart,
                  stationId: station.id,
                }),
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

      <div className="grid gap-2">
        {stage.stationBookings.length === 0 ? (
          <div className="rounded-lg border border-dashed p-2 text-sm text-muted-foreground">No Stations selected</div>
        ) : (
          stage.stationBookings.map((booking) => {
            const station = stations.find((item) => item.id === booking.stationId);
            return (
              <div className="grid gap-2 rounded-lg border p-2 md:grid-cols-[minmax(0,1fr)_auto]" key={booking.id}>
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <BriefcaseBusinessIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{station?.name ?? 'Selected Station'}</span>
                </div>
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

function createDraftId(): string {
  return globalThis.crypto.randomUUID();
}

function createStationBookingDraft({
  dueEnd,
  dueStart,
  stationId,
}: {
  dueEnd: string;
  dueStart: string;
  stationId: UUID;
}): StationBookingDraft {
  return {
    dueEnd,
    dueEndSetManually: false,
    dueStart,
    dueStartSetManually: false,
    id: createDraftId(),
    stationId,
  };
}
