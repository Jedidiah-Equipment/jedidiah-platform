import { formatCurrency, formatHours, formatNumber, formatPercent } from '@pkg/domain';
import type { Assignment, DiscountKind } from '@pkg/schema/contracting';
import { useState } from 'react';
import { toast } from 'sonner';
import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { AddMeasurePopover } from './AddMeasurePopover.js';
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

export const pricingColumns: DataTableColumnDef<PricingRow>[] = [
  { id: 'line', header: 'Line', cell: ({ row }) => <LineCell row={row.original} /> },
  { id: 'quantity', header: 'Hours · measures', cell: ({ row }) => <QuantityCell row={row.original} /> },
  { id: 'rate', header: 'Rate', cell: ({ row }) => <RateCell row={row.original} /> },
  {
    id: 'amount',
    header: 'Amount',
    meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
    cell: ({ row }) => <AmountCell row={row.original} />,
  },
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

function QuantityCell({ row }: { row: PricingRow }) {
  const { editable } = usePricing();
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

function RateCell({ row }: { row: PricingRow }) {
  const { job, editable, rates, mutations } = usePricing();
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
  if (row.kind === 'discount') return <DiscountInput row={row} />;
  return null;
}

function DiscountInput({ row }: { row: Extract<PricingRow, { kind: 'discount' }> }) {
  const { job, editable, mutations } = usePricing();
  const [kind, setKind] = useState<DiscountKind>(row.discount?.kind ?? 'amount');
  if (!editable)
    return row.discount ? (
      <span>
        {row.discount.kind === 'percent' ? formatPercent(row.discount.value) : formatCurrency(row.discount.value)}
      </span>
    ) : null;
  const save = (nextKind: DiscountKind, value: number | null) =>
    mutations.setDiscount.mutate({ jobId: job.id, discount: value === null ? null : { kind: nextKind, value } });
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

function AmountCell({ row }: { row: PricingRow }) {
  const { job, editable, mutations } = usePricing();
  switch (row.kind) {
    case 'stint':
      return <StintAmount stint={row.stint} />;
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

function StintAmount({ stint }: { stint: Assignment }) {
  const { editable, rates, mutations } = usePricing();
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
