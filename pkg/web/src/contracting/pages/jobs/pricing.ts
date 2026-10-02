import { formatCurrency, formatHours, formatNumber } from '@pkg/domain';
import { groupStints, rateUnitLabel } from '@pkg/domain/contracting';
import type { Assignment, JobDetail, Rate, StintPricing } from '@pkg/schema/contracting';

/** The select value for the built-in No charge choice; never a Rate id. */
export const NO_CHARGE = 'no-charge';

export type MachinePricingRow =
  | { kind: 'stint'; stint: Assignment; firstOfMachine: boolean }
  | { kind: 'subtotal'; machineCode: string; amount: number };

/** Machine lines grouped as at sign-off, each repeat Machine followed by its subtotal. */
export function machinePricingRows(assignments: readonly Assignment[]): MachinePricingRow[] {
  return groupStints(assignments).machines.flatMap((machine) => [
    ...machine.stints.map((stint, index) => ({ kind: 'stint' as const, stint, firstOfMachine: index === 0 })),
    ...(machine.subtotal
      ? [{ kind: 'subtotal' as const, machineCode: machine.machineCode, amount: machine.subtotal.amount }]
      : []),
  ]);
}

export type AdjustmentRow =
  | { kind: 'diesel'; litres: number; unitPrice: number | null; amount: number | null; edited: boolean }
  | { kind: 'discount'; discount: JobDetail['discount'] };

/** Supplied Diesel, then the Discount when there is one to show or the person may set one. */
export function adjustmentRows(job: JobDetail, { editable }: { editable: boolean }): AdjustmentRow[] {
  const rows: AdjustmentRow[] = [];
  if (job.dieselLitres > 0)
    rows.push({
      kind: 'diesel',
      litres: job.dieselLitres,
      unitPrice: job.diesel?.unitPrice ?? null,
      amount: job.diesel?.amount ?? null,
      edited: job.diesel?.amountEdited ?? false,
    });
  if (editable || job.discount) rows.push({ kind: 'discount', discount: job.discount });
  return rows;
}

export const formatQuantity = (quantity: number) =>
  formatNumber(quantity, { decimals: Number.isInteger(quantity) ? 0 : 2 });

/** What the computed amount multiplies, shown under it; null while the stint is un-priced. */
export function formulaLabel(pricing: StintPricing | null): string | null {
  if (pricing === null) return null;
  if (pricing.kind === 'no-charge') return 'No charge';
  const unit = formatCurrency(pricing.unitAmount);
  if (pricing.basis === 'time') return `${formatHours(pricing.billedQuantity)} × ${unit}`;
  return `${formatQuantity(pricing.billedQuantity)} ${(pricing.measureTypeName ?? 'units').toLowerCase()} × ${unit}`;
}

const perUnit = (rate: Pick<Rate, 'basis' | 'measureTypeName'>) =>
  `/ ${rateUnitLabel(rate.basis, rate.measureTypeName)}`;

/** Active Rates in Rate Card order, the stint's own Rate kept if it has since gone inactive, then No charge. */
export function rateSelectOptions(rates: readonly Rate[], pricing: StintPricing | null) {
  return [
    ...rates.map((rate) => ({
      value: rate.id,
      label: `${rate.name} · ${formatCurrency(rate.amount)} ${perUnit(rate)}`,
    })),
    ...(pricing?.kind === 'rate' && !rates.some((rate) => rate.id === pricing.rateId)
      ? [{ value: pricing.rateId, label: `${pricing.name} (inactive)` }]
      : []),
    { value: NO_CHARGE, label: 'No charge' },
  ];
}

export function rateSelectValue(pricing: StintPricing | null) {
  if (pricing === null) return '';
  return pricing.kind === 'rate' ? pricing.rateId : NO_CHARGE;
}

/** A Rate Card edit never reaches a Job, so a pricer is told when the snapshot is behind the card. */
export function rateCardDrift(rates: readonly Rate[], pricing: StintPricing | null): string | null {
  if (pricing?.kind !== 'rate') return null;
  const current = rates.find((rate) => rate.id === pricing.rateId);
  if (!current || current.amount === pricing.unitAmount) return null;
  return `Rate Card now ${formatCurrency(current.amount)} ${perUnit(current)} — pick it again to use it.`;
}
