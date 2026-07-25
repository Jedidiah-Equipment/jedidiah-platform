import type { QuoteWorkItemCharge, QuoteWorkItemFormValue } from '@pkg/schema';

import {
  computeWorkItemLabourCost,
  computeWorkItemPartAmount,
  computeWorkItemTotal,
  DEFAULT_CUSTOM_HOURLY_RATE,
} from './quote-pricing.js';

export const LABOUR_CHARGE_LABEL = 'Labour';

type WorkItemPartSource = { name: string; quantity: number; unitPrice: number };
type WorkItemSource = { hours: number; name: string; parts: readonly WorkItemPartSource[] };

type WorkItemFormSource = {
  hours: number;
  name: string;
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
  name: string;
  total: number;
  workItem: TWorkItem;
};

export function toQuoteWorkItemFormState<T extends WorkItemFormSource>(
  quote: { hourlyRate: number; kind: 'custom'; workItems: readonly T[] } | { kind: 'product' },
): { hourlyRate: number; workItems: QuoteWorkItemFormValue[] } {
  if (quote.kind === 'product') return { hourlyRate: DEFAULT_CUSTOM_HOURLY_RATE, workItems: [] };

  return {
    hourlyRate: quote.hourlyRate,
    workItems: quote.workItems.map(({ hours, name, parts }) => ({
      hours,
      name,
      parts: parts.map(({ name: partName, quantity, unitPrice }) => ({ name: partName, quantity, unitPrice })),
    })),
  };
}

export function getWorkItemFormTotal({
  hourlyRate,
  workItem,
}: {
  hourlyRate: number;
  workItem: WorkItemSource;
}): number {
  if (!hasFiniteLabourPricing({ hourlyRate, hours: workItem.hours }) || !workItem.parts.every(hasFinitePartPricing)) {
    return 0;
  }

  return computeWorkItemTotal({ hourlyRate, hours: workItem.hours, parts: workItem.parts });
}

/**
 * Projects Work Items into the breakdown every surface renders: the Quote Document, the Quote editor
 * aside, and the mobile summary drawer all read these rows, so a Work Item's charges add up to the
 * same total wherever they are shown.
 */
export function quoteWorkItemSummaryRows<TWorkItem extends WorkItemSource>({
  hourlyRate,
  workItems,
}: {
  hourlyRate: number;
  workItems: readonly TWorkItem[];
}): QuoteWorkItemSummaryRow<TWorkItem, TWorkItem['parts'][number]>[] {
  return workItems.map((workItem) => ({
    charges: [
      ...(hasFiniteLabourPricing({ hourlyRate, hours: workItem.hours }) && workItem.hours > 0
        ? [
            {
              amount: computeWorkItemLabourCost({ hourlyRate, hours: workItem.hours }),
              kind: 'labour' as const,
              label: LABOUR_CHARGE_LABEL,
              part: null,
              quantity: workItem.hours,
              unitPrice: hourlyRate,
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
    name: workItem.name,
    total: getWorkItemFormTotal({ hourlyRate, workItem }),
    workItem,
  }));
}

function hasFiniteLabourPricing({ hourlyRate, hours }: { hourlyRate: number; hours: number }): boolean {
  return Number.isFinite(hourlyRate) && Number.isFinite(hours);
}

function hasFinitePartPricing(part: WorkItemPartSource): boolean {
  return Number.isFinite(part.quantity) && Number.isFinite(part.unitPrice);
}
