import { countPhrase, formatCurrency, formatDate } from '@pkg/domain';
import { type DateOnlyIso, INVOICED_MONTHS_SHOWN } from '@pkg/schema';
import { Fragment, type ReactNode } from 'react';
import { StatCard, StatCardSkeleton } from '../StatCard.js';
import { DashboardWidgetError } from './DashboardWidgetCard.js';

const gridClassName = 'grid grid-cols-2 gap-4 xl:grid-cols-4';

/** Invoiced by month: this month to date first, each month's total ex VAT and how many were invoiced in it. */
export function InvoicedMonthCards({
  months,
  error,
  noun,
  link,
}: {
  months: readonly { month: DateOnlyIso; total: number; count: number }[] | undefined;
  error: unknown;
  noun: { one: string; many: string };
  /** Renders a month's card inside the link to the Invoiced list. */
  link: (body: ReactNode) => ReactNode;
}) {
  if (error) return <DashboardWidgetError error={error} fallbackMessage="Unable to load invoiced totals." />;
  if (!months)
    return (
      <div className={gridClassName}>
        {Array.from({ length: INVOICED_MONTHS_SHOWN }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders with no identity of their own.
          <StatCardSkeleton key={index} />
        ))}
      </div>
    );
  return (
    <div className={gridClassName}>
      {months.map(({ month, total, count }, index) => (
        <Fragment key={month}>
          {link(
            <StatCard
              label={index === 0 ? `${formatDate(month, 'month')} to date` : formatDate(month, 'month')}
              value={formatCurrency(total, undefined, { decimals: 0 })}
              sublabel={countPhrase(count, noun.one, noun.many)}
            />,
          )}
        </Fragment>
      ))}
    </div>
  );
}
