import type { QuoteWorkItemFormValue } from '@pkg/schema';

import { computeWorkItemTotal, DEFAULT_CUSTOM_HOURLY_RATE } from './quote-pricing.js';

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
}): { name: string; total: number; workItem: QuoteWorkItemFormValue }[] {
  return workItems.map((workItem) => ({
    name: workItem.name,
    total: getWorkItemFormTotal({ hourlyRate, workItem }),
    workItem,
  }));
}
