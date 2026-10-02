import { formatCurrency, formatHours, formatNumber, formatPercent } from '@pkg/domain';
import { stintAmount } from '@pkg/domain/contracting';
import { type Assignment, type DiscountKind, JobDiscountInput } from '@pkg/schema/contracting';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { ChargeLineDescription } from './ChargeLineEditing.js';
import { MoneyInput } from './MoneyInput.js';
import {
  formatQuantity,
  formulaLabel,
  NO_CHARGE,
  type PricingRow,
  rateCardDrift,
  rateSelectOptions,
  rateSelectValue,
} from './pricing.js';
import { usePricing } from './pricing-context.js';

const amountColumn: DataTableColumnDef<PricingRow> = {
  id: 'amount',
  header: 'Amount',
  meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
  cell: ({ row }) => <AmountCell row={row.original} />,
};

export const machinePricingColumns: DataTableColumnDef<PricingRow>[] = [
  { id: 'line', header: 'Line', cell: ({ row }) => <LineCell row={row.original} /> },
  { id: 'quantity', header: 'Hours', cell: ({ row }) => <QuantityCell row={row.original} /> },
  { id: 'measures', header: 'Measures', cell: ({ row }) => <MeasuresCell row={row.original} /> },
  { id: 'rate', header: 'Rate / price', cell: ({ row }) => <RateCell row={row.original} /> },
  amountColumn,
];

export const chargeLinePricingColumns: DataTableColumnDef<PricingRow>[] = [
  { id: 'line', header: 'Line', cell: ({ row }) => <LineCell row={row.original} /> },
  { id: 'rate', header: 'Type', cell: ({ row }) => <RateCell row={row.original} /> },
  amountColumn,
];

export const adjustmentPricingColumns: DataTableColumnDef<PricingRow>[] = [
  { id: 'line', header: 'Adjustment', cell: ({ row }) => <LineCell row={row.original} /> },
  { id: 'quantity', header: 'Quantity', cell: ({ row }) => <QuantityCell row={row.original} /> },
  { id: 'rate', header: 'Rate / price', cell: ({ row }) => <RateCell row={row.original} /> },
  amountColumn,
];

export const pricingRowId = (row: PricingRow) => {
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

function LineCell({ row }: { row: PricingRow }) {
  const { chargeEditable, chargeLineMutations } = usePricing();
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
      return (
        <div className="flex min-w-44 items-center gap-2">
          <div className="min-w-0 flex-1">
            <ChargeLineDescription
              key={row.line.id}
              line={row.line}
              editable={chargeEditable}
              onSave={(description) => chargeLineMutations.patch.mutate({ id: row.line.id, description })}
            />
          </div>
          {chargeEditable ? (
            <RemoveEntityButton
              title="Remove Charge Line"
              description="Remove this Charge Line?"
              triggerIconOnly
              triggerLabel={`Remove ${row.line.description}`}
              triggerSize="icon-sm"
              isPending={chargeLineMutations.remove.isPending}
              onConfirm={() => chargeLineMutations.remove.mutate({ id: row.line.id })}
            />
          ) : null}
        </div>
      );
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

function QuantityCell({ row }: { row: PricingRow }) {
  if (row.kind === 'diesel') return <span>{formatNumber(row.litres, { decimals: 2 })} L</span>;
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

function MeasuresCell({ row }: { row: PricingRow }) {
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

function RateCell({ row }: { row: PricingRow }) {
  const { job, editable, rates, mutations } = usePricing();
  if (row.kind === 'charge-line') return <span className="text-muted-foreground text-xs">Fixed amount</span>;
  if (row.kind === 'stint') {
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
  if (row.kind === 'diesel') {
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
  if (row.kind === 'discount') return <DiscountInput row={row} />;
  return null;
}

function DiscountInput({ row }: { row: Extract<PricingRow, { kind: 'discount' }> }) {
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

function AmountCell({ row }: { row: PricingRow }) {
  const { job, editable, chargeAmountEditable, mutations, chargeLineMutations } = usePricing();
  switch (row.kind) {
    case 'stint':
      return <StintAmount stint={row.stint} />;
    case 'subtotal':
      return <span>{formatCurrency(row.amount)}</span>;
    case 'charge-line':
      return chargeAmountEditable ? (
        <div className="flex justify-end [&_input]:text-right">
          <MoneyInput
            label={`Amount for ${row.line.description}`}
            value={row.line.amount}
            onCommit={(amount) => chargeLineMutations.patch.mutate({ id: row.line.id, amount })}
          />
        </div>
      ) : row.line.amount === null ? (
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
      return row.discount ? <span>− {formatCurrency(row.discount.amount)}</span> : null;
  }
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
