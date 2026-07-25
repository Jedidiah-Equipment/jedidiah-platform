import type { QuoteWorkItemFormValue } from '@pkg/schema';

import {
  computeWorkItemLabourCost,
  computeWorkItemPartAmount,
  computeWorkItemTotal,
  DEFAULT_CUSTOM_HOURLY_RATE,
} from './quote-pricing.js';

type WorkItemFormSource = {
  hours: number;
  name: string;
  parts: readonly ({ name: string; quantity: number; unitPrice: number } & Record<string, unknown>)[];
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
  workItem: QuoteWorkItemFormValue;
}): number {
  if (
    !Number.isFinite(hourlyRate) ||
    !Number.isFinite(workItem.hours) ||
    workItem.parts.some((part) => !Number.isFinite(part.quantity) || !Number.isFinite(part.unitPrice))
  ) {
    return 0;
  }

  return computeWorkItemTotal({ hourlyRate, hours: workItem.hours, parts: workItem.parts });
}

export function quoteWorkItemSummaryRows({
  hourlyRate,
  workItems,
}: {
  hourlyRate: number;
  workItems: readonly QuoteWorkItemFormValue[];
}): {
  labour: { hourlyRate: number; hours: number; total: number } | null;
  name: string;
  parts: {
    name: string;
    part: QuoteWorkItemFormValue['parts'][number];
    quantity: number;
    total: number;
    unitPrice: number;
  }[];
  total: number;
  workItem: QuoteWorkItemFormValue;
}[] {
  return workItems.map((workItem) => ({
    labour:
      Number.isFinite(hourlyRate) && Number.isFinite(workItem.hours) && workItem.hours > 0
        ? {
            hourlyRate,
            hours: workItem.hours,
            total: computeWorkItemLabourCost({ hourlyRate, hours: workItem.hours }),
          }
        : null,
    name: workItem.name,
    parts: workItem.parts.map((part) => ({
      name: part.name,
      part,
      quantity: part.quantity,
      total: Number.isFinite(part.quantity) && Number.isFinite(part.unitPrice) ? computeWorkItemPartAmount(part) : 0,
      unitPrice: part.unitPrice,
    })),
    total: getWorkItemFormTotal({ hourlyRate, workItem }),
    workItem,
  }));
}
