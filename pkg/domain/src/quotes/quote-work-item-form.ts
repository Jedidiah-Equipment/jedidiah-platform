import type { Department, QuoteWorkItemCharge, QuoteWorkItemFormValue } from '@pkg/schema';

import { computeWorkItemLabourCost, computeWorkItemPartAmount, computeWorkItemTotal } from './quote-pricing.js';
import { quoteWorkItemName } from './work-item-departments.js';

export const LABOUR_CHARGE_LABEL = 'Labour';

type WorkItemPartSource = { name: string; quantity: number; unitPrice: number };
type WorkItemSource = {
  department: Department | null;
  description?: string | null;
  hourlyRate: number;
  hours: number;
  name: string | null;
  parts: readonly WorkItemPartSource[];
};

type WorkItemFormSource = Omit<WorkItemSource, 'parts'> & {
  parts: readonly (WorkItemPartSource & Record<string, unknown>)[];
};

/**
 * A Work Item Charge paired with the caller's own Part object — null on the Labour charge — so each
 * layer keeps its richer shape and a stable row identity.
 */
export type QuoteWorkItemChargeRow<TPart> = QuoteWorkItemCharge & { part: TPart | null };

/** A Work Item's name and total beside the ordered Charges that make that total up. */
export type QuoteWorkItemSummaryRow<TWorkItem, TPart> = {
  charges: QuoteWorkItemChargeRow<TPart>[];
  description: string | null;
  name: string;
  total: number;
  workItem: TWorkItem;
};

export function toQuoteWorkItemFormState<T extends WorkItemFormSource>(
  quote: { kind: 'custom'; workItems: readonly T[] } | { kind: 'product' },
): { workItems: QuoteWorkItemFormValue[] } {
  if (quote.kind === 'product') return { workItems: [] };

  return {
    workItems: quote.workItems.map(({ department, description, hourlyRate, hours, name, parts }) => ({
      department,
      description: description ?? null,
      hourlyRate,
      hours,
      name,
      parts: parts.map(({ name: partName, quantity, unitPrice }) => ({ name: partName, quantity, unitPrice })),
    })),
  };
}

export function getWorkItemFormTotal({ workItem }: { workItem: WorkItemSource }): number {
  if (!hasFiniteLabourPricing(workItem) || !workItem.parts.every(hasFinitePartPricing)) {
    return 0;
  }

  return computeWorkItemTotal(workItem);
}

/**
 * Projects Work Items into the breakdown every surface renders: the Quote Document, the Quote editor
 * aside, and the mobile summary drawer all read these rows, so a Work Item breaks down the same way
 * wherever it is shown. `name` resolves here, which is why a Department's quote-facing label reaches
 * every quote surface from one place.
 *
 * `charges` itemise what sits *beneath* the line — labour and Parts. A department-less Other line is
 * a flat amount rather than labour, so it contributes no charge of its own and reads as a single row;
 * its `total` still carries the amount.
 */
export function quoteWorkItemSummaryRows<TWorkItem extends WorkItemSource>({
  workItems,
}: {
  workItems: readonly TWorkItem[];
}): QuoteWorkItemSummaryRow<TWorkItem, TWorkItem['parts'][number]>[] {
  return workItems.map((workItem) => ({
    charges: [
      // Only a departmental Work Item is labour. An Other line is a flat amount carried as one unit,
      // so it shows as a single row rather than a heading above a redundant "Labour" charge.
      ...(workItem.department !== null && hasFiniteLabourPricing(workItem) && workItem.hours > 0
        ? [
            {
              amount: computeWorkItemLabourCost(workItem),
              kind: 'labour' as const,
              label: LABOUR_CHARGE_LABEL,
              part: null,
              quantity: workItem.hours,
              unitPrice: workItem.hourlyRate,
            },
          ]
        : []),
      ...workItem.parts.map((part) => ({
        amount: hasFinitePartPricing(part) ? computeWorkItemPartAmount(part) : 0,
        kind: 'part' as const,
        label: part.name,
        part,
        quantity: part.quantity,
        unitPrice: part.unitPrice,
      })),
    ],
    description: workItem.description ?? null,
    name: quoteWorkItemName(workItem),
    total: getWorkItemFormTotal({ workItem }),
    workItem,
  }));
}

function hasFiniteLabourPricing({ hourlyRate, hours }: { hourlyRate: number; hours: number }): boolean {
  return Number.isFinite(hourlyRate) && Number.isFinite(hours);
}

function hasFinitePartPricing(part: WorkItemPartSource): boolean {
  return Number.isFinite(part.quantity) && Number.isFinite(part.unitPrice);
}
