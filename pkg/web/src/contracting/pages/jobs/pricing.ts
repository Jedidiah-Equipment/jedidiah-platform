import { formatCurrency, formatHours, formatNumber } from '@pkg/domain';
import { round2 } from '@pkg/domain/contracting';
import type { Assignment, ChargeLine, DiscountKind, JobDetail, Rate } from '@pkg/schema/contracting';
import { groupStints } from './types.js';

/** The select value for the built-in No charge choice; never a Rate id. */
export const NO_CHARGE = 'no-charge';

export type PricingRow =
  | { kind: 'stint'; stint: Assignment; firstOfMachine: boolean }
  | { kind: 'subtotal'; machineCode: string; amount: number }
  | { kind: 'charge-line'; line: ChargeLine }
  | { kind: 'diesel'; litres: number; unitPrice: number | null; amount: number | null; edited: boolean }
  | { kind: 'discount'; discount: { kind: DiscountKind; value: number } | null; amount: number | null };

/** Machine lines grouped as at sign-off, then Charge Lines, supplied Diesel, and the Discount when there is one to show. */
export function pricingRows(job: JobDetail, { editable }: { editable: boolean }): PricingRow[] {
  const rows: PricingRow[] = [];
  let group: Assignment[] = [];
  for (const row of groupStints(job.assignments)) {
    if (row.kind === 'stint') {
      if (row.firstOfMachine) group = [];
      group.push(row.stint);
      rows.push(row);
    } else if (row.kind === 'subtotal') {
      const amount = round2(group.reduce((total, stint) => total + (stint.finalAmount ?? 0), 0));
      rows.push({ kind: 'subtotal', machineCode: row.machineCode, amount });
    }
  }
  for (const line of job.chargeLines) rows.push({ kind: 'charge-line', line });
  if (job.dieselLitres > 0)
    rows.push({
      kind: 'diesel',
      litres: job.dieselLitres,
      unitPrice: job.dieselUnitPrice,
      amount: job.dieselAmount,
      edited: job.dieselAmountEdited,
    });
  const discount =
    job.discountKind !== null && job.discountValue !== null
      ? { kind: job.discountKind, value: job.discountValue }
      : null;
  if (editable || discount) rows.push({ kind: 'discount', discount, amount: job.discountAmount });
  return rows;
}

export const formatQuantity = (quantity: number) =>
  formatNumber(quantity, { decimals: Number.isInteger(quantity) ? 0 : 2 });

/** What the computed amount multiplies, shown under it; null while the stint is un-priced. */
export function formulaLabel(stint: Assignment, measureTypeName: (id: string) => string | undefined): string | null {
  if (stint.rateUnitAmount === null) return null;
  if (stint.rateBasis === null) return 'No charge';
  const quantity = stint.billedQuantity ?? 0;
  const unit = formatCurrency(stint.rateUnitAmount);
  if (stint.rateBasis === 'time') return `${formatHours(quantity)} × ${unit}`;
  const name = (stint.rateMeasureTypeId && measureTypeName(stint.rateMeasureTypeId)) ?? 'units';
  return `${formatQuantity(quantity)} ${name.toLowerCase()} × ${unit}`;
}

const perUnit = (rate: Pick<Rate, 'basis' | 'measureTypeName'>) =>
  rate.basis === 'time' ? '/ h' : `/ ${rate.measureTypeName ?? 'unit'}`;

/** Active Rates in Rate Card order, the stint's own Rate kept if it has since gone inactive, then No charge. */
export function rateSelectOptions(rates: readonly Rate[], stint: Assignment) {
  return [
    ...rates.map((rate) => ({
      value: rate.id,
      label: `${rate.name} · ${formatCurrency(rate.amount)} ${perUnit(rate)}`,
    })),
    ...(stint.rateId && !rates.some((rate) => rate.id === stint.rateId)
      ? [{ value: stint.rateId, label: `${stint.rateName} (inactive)` }]
      : []),
    { value: NO_CHARGE, label: 'No charge' },
  ];
}

export function rateSelectValue(stint: Assignment) {
  if (stint.rateUnitAmount === null) return '';
  return stint.rateId ?? NO_CHARGE;
}

/** A Rate Card edit never reaches a Job, so a pricer is told when the snapshot is behind the card. */
export function rateCardDrift(rates: readonly Rate[], stint: Assignment): string | null {
  const current = rates.find((rate) => rate.id === stint.rateId);
  if (!current || current.amount === stint.rateUnitAmount) return null;
  return `Rate Card now ${formatCurrency(current.amount)} ${perUnit(current)} — pick it again to use it.`;
}
