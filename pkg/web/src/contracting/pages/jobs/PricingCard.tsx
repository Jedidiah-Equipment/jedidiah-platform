import { formatCurrency, formatDate, formatHours, formatNumber, formatPercent } from '@pkg/domain';
import { pricingGateReasons } from '@pkg/domain/contracting';
import type { Assignment, DiscountKind, JobDetail, Rate } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { HelpLink } from '@/components/help/index.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { getApiErrorAppCode } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { AddMeasurePopover } from './AddMeasurePopover.js';
import { MoneyInput } from './MoneyInput.js';
import {
  formatQuantity,
  formulaLabel,
  NO_CHARGE,
  type PricingRow,
  pricingRows,
  rateCardDrift,
  rateSelectOptions,
  rateSelectValue,
} from './pricing.js';
import type { jobCapabilities } from './types.js';

type Capabilities = ReturnType<typeof jobCapabilities>;

function usePricingMutations() {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const showError = useApiMutationErrorToast();
  const options = (message: string) => ({
    onSuccess: invalidateJobs,
    onError: (error: unknown) => showError(error, message),
  });
  return {
    setRate: useMutation(trpc.contractingJobs.pricing.setStintRate.mutationOptions(options('Unable to set the Rate.'))),
    clearRate: useMutation(
      trpc.contractingJobs.pricing.clearStintRate.mutationOptions(options('Unable to clear the Rate.')),
    ),
    setAmount: useMutation(
      trpc.contractingJobs.pricing.setStintAmount.mutationOptions(options('Unable to change the amount.')),
    ),
    setDiesel: useMutation(trpc.contractingJobs.pricing.setDiesel.mutationOptions(options('Unable to price Diesel.'))),
    setDiscount: useMutation(
      trpc.contractingJobs.pricing.setDiscount.mutationOptions(options('Unable to set the Discount.')),
    ),
    markPriced: useMutation(
      trpc.contractingJobs.pricing.markPriced.mutationOptions({
        onSuccess: async () => {
          await invalidateJobs();
          toast.success('Job priced');
        },
        onError: async (error) => {
          if (getApiErrorAppCode(error) === 'contracting_job.total_changed') {
            toast.error('The total changed while you were pricing — review it and mark as Priced again.');
            await invalidateJobs();
          } else showError(error, 'Unable to mark the Job as Priced.');
        },
      }),
    ),
  };
}

type Mutations = ReturnType<typeof usePricingMutations>;

export function PricingCard({ job, capabilities }: { job: JobDetail; capabilities: Capabilities }) {
  const trpc = useTRPC();
  const editable = capabilities.price;
  const rates = useQuery(trpc.contractingRateCard.rates.options.queryOptions(undefined, { enabled: editable }));
  const mutations = usePricingMutations();
  const hash = useLocation({ select: (location) => location.hash });
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (hash === 'pricing') section.current?.scrollIntoView({ block: 'start' });
  }, [hash]);
  const rows = useMemo(() => pricingRows(job, { editable }), [job, editable]);
  const nothingChosen = job.assignments.every((stint) => stint.rateUnitAmount === null);
  const columns = usePricingColumns({ job, editable, rates: rates.data ?? [], mutations });
  const table = useDataTable({ columns, data: rows, getRowId: rowId });
  if (!capabilities.seePricing) return null;
  return (
    <section id="pricing" ref={section} aria-label="Pricing" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <CardTitle>
            Pricing <HelpLink label="How to price a Job" topic="contractingJobPricing" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {job.reopenedAt ? (
            <Alert>
              <AlertTitle>Re-pricing needed</AlertTitle>
              <AlertDescription>
                {job.repricingNote} · {formatDate(job.reopenedAt, 'medium')}
              </AlertDescription>
            </Alert>
          ) : null}
          {job.pricedAt && job.pricedTotal !== null ? (
            <p className="font-medium">
              Priced {formatDate(job.pricedAt)} · {formatCurrency(job.pricedTotal)} ex VAT
            </p>
          ) : null}
          {!editable && job.status === 'completed' && nothingChosen ? (
            <p className="text-muted-foreground">Awaiting pricing.</p>
          ) : (
            <>
              <DataTable
                table={table}
                paginationMode="complete"
                total={rows.length}
                hideGlobalFilter
                emptyMessage="Nothing to price."
                getRowClassName={(row) => (row.kind === 'subtotal' ? 'bg-muted/40 font-medium' : undefined)}
                totalLabel={(value) => `${formatNumber(value)} ${value === 1 ? 'line' : 'lines'}`}
              />
              {job.chargeLines.length && editable ? (
                <a className="text-primary text-sm underline-offset-4 hover:underline" href="#charge-lines">
                  Edit charge lines ↓
                </a>
              ) : null}
              <PricingTotals job={job} />
            </>
          )}
          {editable ? <MarkPriced job={job} mutations={mutations} /> : null}
        </CardContent>
      </Card>
    </section>
  );
}

const rowId = (row: PricingRow) => {
  switch (row.kind) {
    case 'stint':
      return row.stint.id;
    case 'subtotal':
      return `subtotal-${row.machineCode}`;
    case 'charge-line':
      return row.line.id;
    default:
      return row.kind;
  }
};

function usePricingColumns({
  job,
  editable,
  rates,
  mutations,
}: {
  job: JobDetail;
  editable: boolean;
  rates: readonly Rate[];
  mutations: Mutations;
}) {
  return useMemo<DataTableColumnDef<PricingRow>[]>(
    () => [
      { id: 'line', header: 'Line', cell: ({ row }) => <LineCell row={row.original} /> },
      {
        id: 'quantity',
        header: 'Hours · measures',
        cell: ({ row }) => <QuantityCell row={row.original} editable={editable} />,
      },
      {
        id: 'rate',
        header: 'Rate',
        cell: ({ row }) => (
          <RateCell row={row.original} job={job} editable={editable} rates={rates} mutations={mutations} />
        ),
      },
      {
        id: 'amount',
        header: 'Amount',
        meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
        cell: ({ row }) => (
          <AmountCell row={row.original} job={job} editable={editable} rates={rates} mutations={mutations} />
        ),
      },
    ],
    [job, editable, rates, mutations],
  );
}

function LineCell({ row }: { row: PricingRow }) {
  switch (row.kind) {
    case 'stint':
      return (
        <span className={row.firstOfMachine ? 'font-medium' : 'pl-4'}>
          {row.stint.machineCode}
          {row.stint.implementCode ? ` · ${row.stint.implementCode}` : ''}
        </span>
      );
    case 'subtotal':
      return <span>{row.machineCode} subtotal</span>;
    case 'charge-line':
      return <span>{row.line.description}</span>;
    case 'diesel':
      return (
        <span className="flex items-center gap-2">
          Diesel supplied <Badge variant="outline">VAT-exempt</Badge>
        </span>
      );
    case 'discount':
      return <span>Discount</span>;
  }
}

function QuantityCell({ row, editable }: { row: PricingRow; editable: boolean }) {
  if (row.kind === 'diesel') return <span>{formatNumber(row.litres, { decimals: 2 })} L</span>;
  if (row.kind !== 'stint') return null;
  const { stint } = row;
  return (
    <div className="space-y-1">
      {stint.billableHours !== null ? (
        <div>
          <span>{formatHours(stint.billableHours)}</span>
          <span className="block text-muted-foreground text-xs">
            work {formatHours(stint.workHours ?? 0)} + travel {formatHours(stint.travelHours)}
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {stint.measures.map((measure) => (
          <Badge key={measure.id} variant="secondary">
            {formatQuantity(measure.quantity)} {measure.measureTypeName}
          </Badge>
        ))}
        {editable ? <AddMeasurePopover stint={stint} /> : null}
      </div>
    </div>
  );
}

function RateCell({
  row,
  job,
  editable,
  rates,
  mutations,
}: {
  row: PricingRow;
  job: JobDetail;
  editable: boolean;
  rates: readonly Rate[];
  mutations: Mutations;
}) {
  if (row.kind === 'stint') {
    const { stint } = row;
    if (!editable) return <span>{stint.rateUnitAmount === null ? '—' : (stint.rateName ?? 'No charge')}</span>;
    const drift = rateCardDrift(rates, stint);
    return (
      <div className="min-w-56 space-y-1">
        <SearchableCombobox
          inputId={`rate-${stint.id}`}
          options={rateSelectOptions(rates, stint)}
          placeholder="Choose a Rate…"
          value={rateSelectValue(stint)}
          onValueChange={(value) =>
            value === ''
              ? mutations.clearRate.mutate({ assignmentId: stint.id })
              : mutations.setRate.mutate({ assignmentId: stint.id, rateId: value === NO_CHARGE ? null : value })
          }
        />
        {drift ? <p className="text-muted-foreground text-xs">{drift}</p> : null}
      </div>
    );
  }
  if (row.kind === 'diesel') {
    if (!editable) return row.unitPrice === null ? <span>—</span> : <span>{formatCurrency(row.unitPrice)} / L</span>;
    return (
      <div className="flex items-center gap-2">
        <MoneyInput
          label="Diesel price per litre"
          value={row.unitPrice}
          onCommit={(unitPrice) => mutations.setDiesel.mutate({ jobId: job.id, unitPrice })}
        />
        <span className="text-muted-foreground text-sm">per litre</span>
      </div>
    );
  }
  if (row.kind === 'discount')
    return <DiscountInput row={row} jobId={job.id} editable={editable} mutations={mutations} />;
  return null;
}

function DiscountInput({
  row,
  jobId,
  editable,
  mutations,
}: {
  row: Extract<PricingRow, { kind: 'discount' }>;
  jobId: string;
  editable: boolean;
  mutations: Mutations;
}) {
  const [kind, setKind] = useState<DiscountKind>(row.discount?.kind ?? 'amount');
  if (!editable)
    return row.discount ? (
      <span>
        {row.discount.kind === 'percent' ? formatPercent(row.discount.value) : formatCurrency(row.discount.value)}
      </span>
    ) : null;
  const save = (nextKind: DiscountKind, value: number | null) =>
    mutations.setDiscount.mutate({ jobId, discount: value === null ? null : { kind: nextKind, value } });
  return (
    <div className="flex items-center gap-2">
      <fieldset className="flex" aria-label="Discount kind">
        {(['amount', 'percent'] as const).map((option) => (
          <Button
            key={option}
            size="sm"
            variant={kind === option ? 'default' : 'outline'}
            aria-pressed={kind === option}
            onClick={() => {
              if (row.discount && option === 'percent' && row.discount.value > 100) {
                toast.error('A percentage discount cannot exceed 100. Enter the percentage instead.');
                return;
              }
              setKind(option);
              if (row.discount && row.discount.kind !== option) save(option, row.discount.value);
            }}
          >
            {option === 'amount' ? 'R' : '%'}
          </Button>
        ))}
      </fieldset>
      <MoneyInput
        label="Discount"
        unit={kind === 'percent' ? '%' : undefined}
        value={row.discount?.value ?? null}
        onCommit={(value) => save(kind, value)}
      />
    </div>
  );
}

function AmountCell({
  row,
  job,
  editable,
  rates,
  mutations,
}: {
  row: PricingRow;
  job: JobDetail;
  editable: boolean;
  rates: readonly Rate[];
  mutations: Mutations;
}) {
  switch (row.kind) {
    case 'stint':
      return <StintAmount stint={row.stint} editable={editable} rates={rates} mutations={mutations} />;
    case 'subtotal':
      return <span>{formatCurrency(row.amount)}</span>;
    case 'charge-line':
      return row.line.amount === null ? (
        <span className="text-destructive">Needs an amount</span>
      ) : (
        <span>{formatCurrency(row.line.amount)}</span>
      );
    case 'diesel':
      return (
        <EditableAmount
          amount={row.amount}
          editable={editable && row.unitPrice !== null}
          edited={row.edited}
          formula={
            row.unitPrice === null
              ? null
              : `${formatNumber(row.litres, { decimals: 2 })} L × ${formatCurrency(row.unitPrice)}`
          }
          label="Diesel amount"
          onCommit={(amount) => mutations.setDiesel.mutate({ jobId: job.id, unitPrice: row.unitPrice, amount })}
        />
      );
    case 'discount':
      return row.amount ? <span>− {formatCurrency(row.amount)}</span> : null;
  }
}

function StintAmount({
  stint,
  editable,
  rates,
  mutations,
}: {
  stint: Assignment;
  editable: boolean;
  rates: readonly Rate[];
  mutations: Mutations;
}) {
  const measureTypeName = (id: string) =>
    stint.measures.find((measure) => measure.measureTypeId === id)?.measureTypeName ??
    rates.find((rate) => rate.measureTypeId === id)?.measureTypeName ??
    undefined;
  const missingName = stint.rateMeasureTypeId ? measureTypeName(stint.rateMeasureTypeId) : undefined;
  return (
    <div className="space-y-1">
      <EditableAmount
        amount={stint.finalAmount}
        editable={editable && stint.rateBasis !== null}
        edited={stint.amountEdited}
        formula={formulaLabel(stint, measureTypeName)}
        label={`Amount for ${stint.machineCode}`}
        onCommit={(finalAmount) => mutations.setAmount.mutate({ assignmentId: stint.id, finalAmount })}
      />
      {stint.measureMissing ? (
        <p className="text-destructive text-xs">
          No {missingName ? `${missingName} ` : ''}measure recorded on this Assignment
        </p>
      ) : null}
    </div>
  );
}

/** The computed amount with its formula; click to type an override, and reset it to the computed figure. */
function EditableAmount({
  amount,
  editable,
  edited,
  formula,
  label,
  onCommit,
}: {
  amount: number | null;
  editable: boolean;
  edited: boolean;
  formula: string | null;
  label: string;
  onCommit: (amount: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (amount === null && !editable) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col items-end gap-0.5">
      {editing ? (
        <MoneyInput
          autoFocus
          label={label}
          value={amount}
          onCommit={(value) => {
            if (value !== null) onCommit(value);
          }}
          onDone={() => setEditing(false)}
        />
      ) : editable ? (
        <button type="button" className="font-medium hover:underline" onClick={() => setEditing(true)}>
          {amount === null ? '—' : formatCurrency(amount)}
        </button>
      ) : (
        <span className="font-medium">{amount === null ? '—' : formatCurrency(amount)}</span>
      )}
      {formula ? <span className="text-muted-foreground text-xs">{formula}</span> : null}
      {edited ? (
        <span className="flex items-center gap-2 text-xs">
          <Badge variant="outline">edited</Badge>
          {editable ? (
            <button type="button" className="text-primary hover:underline" onClick={() => onCommit(null)}>
              Reset to computed
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function PricingTotals({ job }: { job: JobDetail }) {
  if (!job.pricing) return null;
  const lines = [
    ['Subtotal', formatCurrency(job.pricing.subtotal)],
    ['Discount', job.pricing.discountAmount ? `− ${formatCurrency(job.pricing.discountAmount)}` : formatCurrency(0)],
    ['Diesel (VAT-exempt)', formatCurrency(job.pricing.dieselAmount)],
  ] as const;
  return (
    <dl className="ml-auto grid w-full max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
      {lines.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right">{value}</dd>
        </div>
      ))}
      <dt className="font-semibold">Total ex VAT</dt>
      <dd className="text-right font-semibold">{formatCurrency(job.pricing.total)}</dd>
    </dl>
  );
}

function MarkPriced({ job, mutations }: { job: JobDetail; mutations: Mutations }) {
  const [confirm, setConfirm] = useState(false);
  const pricing = job.pricing;
  if (!pricing) return null;
  const reasons = pricingGateReasons(pricing.gate);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={!pricing.gate.ok} onClick={() => setConfirm(true)}>
        Mark as Priced
      </Button>
      {reasons.length ? <p className="text-destructive">{reasons.join(' · ')}</p> : null}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Priced?</DialogTitle>
            <DialogDescription>
              Subtotal {formatCurrency(pricing.subtotal)} · Discount {formatCurrency(pricing.discountAmount)} · Diesel{' '}
              {formatCurrency(pricing.dieselAmount)} · Total {formatCurrency(pricing.total)} ex VAT. The amounts freeze
              and the Job moves to Awaiting invoice.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              disabled={mutations.markPriced.isPending}
              onClick={() =>
                mutations.markPriced.mutate(
                  { id: job.id, expectedTotal: pricing.total },
                  { onSettled: () => setConfirm(false) },
                )
              }
            >
              Mark as Priced
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
