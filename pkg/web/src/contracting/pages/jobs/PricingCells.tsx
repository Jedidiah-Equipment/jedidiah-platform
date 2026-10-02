import { formatCurrency, formatHours, formatNumber, formatPercent } from '@pkg/domain';
import { stintAmount } from '@pkg/domain/contracting';
import { type Assignment, type DiscountKind, JobDiscountInput } from '@pkg/schema/contracting';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { MoneyInput } from './MoneyInput.js';
import {
  type AdjustmentRow,
  formatQuantity,
  formulaLabel,
  type MachinePricingRow,
  NO_CHARGE,
  rateCardDrift,
  rateSelectOptions,
  rateSelectValue,
} from './pricing.js';
import { usePricing } from './pricing-context.js';

const rightAligned = { cellClassName: 'text-right', headerClassName: 'text-right' };

export const machinePricingColumns: DataTableColumnDef<MachinePricingRow>[] = [
  { id: 'line', header: 'Line', cell: ({ row }) => <MachineLineCell row={row.original} /> },
  { id: 'quantity', header: 'Hours', cell: ({ row }) => <StintHoursCell row={row.original} /> },
  { id: 'measures', header: 'Measures', cell: ({ row }) => <MeasuresCell row={row.original} /> },
  { id: 'rate', header: 'Rate / price', cell: ({ row }) => <StintRateCell row={row.original} /> },
  { id: 'amount', header: 'Amount', meta: rightAligned, cell: ({ row }) => <MachineAmountCell row={row.original} /> },
];
export const machinePricingRowId = (row: MachinePricingRow) =>
  row.kind === 'stint' ? row.stint.id : `subtotal-${row.machineCode}`;

export const adjustmentPricingColumns: DataTableColumnDef<AdjustmentRow>[] = [
  { id: 'line', header: 'Adjustment', cell: ({ row }) => <AdjustmentLineCell row={row.original} /> },
  { id: 'quantity', header: 'Quantity', cell: ({ row }) => <AdjustmentQuantityCell row={row.original} /> },
  { id: 'rate', header: 'Rate / price', cell: ({ row }) => <AdjustmentRateCell row={row.original} /> },
  {
    id: 'amount',
    header: 'Amount',
    meta: rightAligned,
    cell: ({ row }) => <AdjustmentAmountCell row={row.original} />,
  },
];
export const adjustmentRowId = (row: AdjustmentRow) => row.kind;

function MachineLineCell({ row }: { row: MachinePricingRow }) {
  if (row.kind === 'subtotal') return <span>{row.machineCode} subtotal</span>;
  return (
    <span className={row.firstOfMachine ? 'font-medium' : 'pl-4'}>
      {row.stint.machineCode}
      {row.stint.implementCode ? ` · ${row.stint.implementCode}` : ''}
    </span>
  );
}

function StintHoursCell({ row }: { row: MachinePricingRow }) {
  if (row.kind !== 'stint') return null;
  const { stint } = row;
  return stint.billableHours !== null ? (
    <div>
      <span>{formatHours(stint.billableHours)}</span>
      <span className="block text-muted-foreground text-xs">
        work {formatHours(stint.workHours ?? 0)} + travel {formatHours(stint.travelHours)}
      </span>
    </div>
  ) : null;
}

function MeasuresCell({ row }: { row: MachinePricingRow }) {
  if (row.kind !== 'stint') return null;
  return row.stint.measures.length ? (
    <div className="flex min-w-32 flex-wrap gap-1">
      {row.stint.measures.map((measure) => (
        <Badge key={measure.id} variant="secondary">
          {formatQuantity(measure.quantity)} {measure.measureTypeName}
        </Badge>
      ))}
    </div>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function StintRateCell({ row }: { row: MachinePricingRow }) {
  const { editable, rates, mutations } = usePricing();
  if (row.kind !== 'stint') return null;
  const { stint } = row;
  if (!editable)
    return (
      <span>{stint.pricing === null ? '—' : stint.pricing.kind === 'rate' ? stint.pricing.name : 'No charge'}</span>
    );
  const drift = rateCardDrift(rates, stint.pricing);
  return (
    <div className="min-w-56 space-y-1">
      <SearchableCombobox
        inputId={`rate-${stint.id}`}
        options={rateSelectOptions(rates, stint.pricing)}
        placeholder="Choose a Rate…"
        value={rateSelectValue(stint.pricing)}
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

function MachineAmountCell({ row }: { row: MachinePricingRow }) {
  if (row.kind === 'subtotal') return <span>{formatCurrency(row.amount)}</span>;
  return <StintAmount stint={row.stint} />;
}

function AdjustmentLineCell({ row }: { row: AdjustmentRow }) {
  if (row.kind === 'discount') return <span>Discount</span>;
  return (
    <span className="flex items-center gap-2">
      Diesel supplied <Badge variant="outline">VAT-exempt</Badge>
    </span>
  );
}

function AdjustmentQuantityCell({ row }: { row: AdjustmentRow }) {
  if (row.kind !== 'diesel') return null;
  return <span>{formatNumber(row.litres, { decimals: 2 })} L</span>;
}

function AdjustmentRateCell({ row }: { row: AdjustmentRow }) {
  const { job, editable, mutations } = usePricing();
  if (row.kind === 'discount') return <DiscountInput row={row} />;
  if (!editable) return row.unitPrice === null ? <span>—</span> : <span>{formatCurrency(row.unitPrice)} / L</span>;
  return (
    <div className="grid grid-cols-[4.5rem_11rem] items-center gap-2">
      <MoneyInput
        className="col-start-2 w-full"
        label="Diesel price per litre"
        suffix="per litre"
        value={row.unitPrice}
        onCommit={(unitPrice) => mutations.setDiesel.mutate({ jobId: job.id, unitPrice })}
      />
    </div>
  );
}

function DiscountInput({ row }: { row: Extract<AdjustmentRow, { kind: 'discount' }> }) {
  const { job, editable, mutations } = usePricing();
  const savedKind = row.discount?.kind;
  const savedValue = row.discount?.value ?? null;
  const [kind, setKind] = useState<DiscountKind>(savedKind ?? 'amount');
  const currentValue = useRef(savedValue);
  const pendingSave = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    currentValue.current = savedValue;
  }, [savedValue]);
  useEffect(() => {
    if (savedKind) setKind(savedKind);
  }, [savedKind]);
  if (!editable)
    return row.discount ? (
      <span>
        {row.discount.kind === 'percent' ? formatPercent(row.discount.value) : formatCurrency(row.discount.value)}
      </span>
    ) : null;
  const save = (nextKind: DiscountKind, value: number | null) => {
    currentValue.current = value;
    // A kind click blurs the amount field first. Keep both writes in order and use the just-entered value.
    pendingSave.current = pendingSave.current
      .then(() =>
        mutations.setDiscount.mutateAsync({
          jobId: job.id,
          discount: value === null ? null : { kind: nextKind, value },
        }),
      )
      .then(() => undefined)
      .catch(() => undefined);
  };
  return (
    <div className="grid grid-cols-[4.5rem_11rem] items-center gap-2">
      <fieldset className="flex" aria-label="Discount kind">
        {(['amount', 'percent'] as const).map((option) => (
          <Button
            key={option}
            size="sm"
            variant={kind === option ? 'default' : 'outline'}
            aria-pressed={kind === option}
            onClick={() => {
              if (option === kind) return;
              if (
                option === 'percent' &&
                currentValue.current !== null &&
                !JobDiscountInput.safeParse({ kind: option, value: currentValue.current }).success
              ) {
                toast.error('A percentage discount cannot exceed 100. Enter the percentage instead.');
                return;
              }
              setKind(option);
              if (currentValue.current !== null) save(option, currentValue.current);
            }}
          >
            {option === 'amount' ? 'R' : '%'}
          </Button>
        ))}
      </fieldset>
      <MoneyInput
        className="w-full"
        label="Discount"
        unit={kind === 'percent' ? '%' : undefined}
        value={savedValue}
        onCommit={(value) => save(kind, value)}
      />
    </div>
  );
}

function AdjustmentAmountCell({ row }: { row: AdjustmentRow }) {
  const { job, editable, mutations } = usePricing();
  if (row.kind === 'discount') return row.discount ? <span>− {formatCurrency(row.discount.amount)}</span> : null;
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
}

function StintAmount({ stint }: { stint: Assignment }) {
  const { editable, mutations } = usePricing();
  const { pricing } = stint;
  const rate = pricing?.kind === 'rate' ? pricing : null;
  return (
    <div className="space-y-1">
      <EditableAmount
        amount={pricing === null ? null : stintAmount(pricing)}
        editable={editable && rate !== null}
        edited={rate?.amountEdited ?? false}
        formula={formulaLabel(pricing)}
        label={`Amount for ${stint.machineCode}`}
        onCommit={(finalAmount) => mutations.setAmount.mutate({ assignmentId: stint.id, finalAmount })}
      />
      {rate?.measureMissing ? (
        <p className="text-destructive text-xs">
          No {rate.measureTypeName ? `${rate.measureTypeName} ` : ''}measure recorded on this Assignment
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
