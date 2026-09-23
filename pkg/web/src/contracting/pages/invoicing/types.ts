import { formatDate, getZonedDateParts, JOHANNESBURG_TIME_ZONE } from '@pkg/domain';
import { DateOnlyIso } from '@pkg/schema';
import { z } from 'zod';

export const invoicingTabs = ['awaiting-invoice', 'invoiced'] as const;
export type InvoicingTab = (typeof invoicingTabs)[number];

const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const InvoicingSearch = z.object({
  tab: z.enum(invoicingTabs).catch('awaiting-invoice').default('awaiting-invoice'),
  month: Month.optional().catch(undefined),
});
export type InvoicingSearch = z.infer<typeof InvoicingSearch>;

const MONTHS_OFFERED = 24;

/** yyyy-MM of the South African calendar month `monthsBack` before the one containing `now`. */
export function monthKey(now: Date, monthsBack = 0) {
  const { month, year } = getZonedDateParts(now, JOHANNESBURG_TIME_ZONE);
  const offset = year * 12 + (month - 1) - monthsBack;
  return `${Math.floor(offset / 12)}-${String((offset % 12) + 1).padStart(2, '0')}`;
}

export const invoicedInMonth = (month: string) => DateOnlyIso.parse(`${month}-01`);

export const monthLabel = (month: string) => formatDate(invoicedInMonth(month), 'month');

export function invoicedMonthOptions(now: Date) {
  return Array.from({ length: MONTHS_OFFERED }, (_, index) => {
    const value = monthKey(now, index);
    return { value, label: monthLabel(value) };
  });
}
