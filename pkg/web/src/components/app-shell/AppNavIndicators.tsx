import { buyListReasonsNotify, STOCKTAKE_SCOPE_LABELS } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { SidebarMenuBadge } from '@/components/ui/sidebar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

/**
 * A dot says only that something is waiting; the tooltip says what and how many, so nobody has to
 * open the page to find out. The badge is `pointer-events-none` by default — it has to take hover
 * back to be a tooltip trigger at all, and a click still falls through to the nav link underneath.
 */
const NavWarningDot: React.FC<{
  label: string;
}> = ({ label }) => (
  <SidebarMenuBadge
    aria-label={label}
    className="pointer-events-auto right-3 min-w-0 px-0 group-data-[collapsible=icon]:right-1.5 group-data-[collapsible=icon]:flex"
  >
    <Tooltip>
      <TooltipTrigger render={<span className="size-2 rounded-full bg-warning ring-2 ring-sidebar" />} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  </SidebarMenuBadge>
);

export const QuotesPriorityNavIndicator: React.FC = () => {
  const trpc = useTRPC();
  const quoteAccess = useCan('quote:read');
  const priorityQuotesQuery = useQuery({
    ...trpc.quotes.priorityList.queryOptions(),
    enabled: quoteAccess.can,
  });

  const priorityCount = priorityQuotesQuery.data?.length ?? 0;

  return priorityCount > 0 ? (
    <NavWarningDot
      label={`${priorityCount} accepted ${plural(priorityCount, 'Quote is', 'Quotes are')} due soon with no Job started`}
    />
  ) : null;
};

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

/**
 * The out-of-stock and below-minimum "notification" the spec asks for (§9, §12): a dot beside the
 * buy list, not an email and never an automatic order. It watches the two signals a storeman is
 * expected to act on rather than the whole list — a Part short for a Job three weeks out is
 * procurement's ordinary work, not something to interrupt anyone over.
 */
export const BuyListSignalNavIndicator: React.FC = () => {
  const trpc = useTRPC();
  const inventoryAccess = useCan('inventory:read');
  const buyListQuery = useQuery({
    ...trpc.inventory.buyList.queryOptions(),
    enabled: inventoryAccess.can,
  });
  const notifying = (buyListQuery.data?.items ?? []).filter((item) => buyListReasonsNotify(item.reasons));

  return notifying.length > 0 ? (
    <NavWarningDot
      label={`${notifying.length} ${plural(notifying.length, 'Part is', 'Parts are')} out of stock or below minimum`}
    />
  ) : null;
};

/**
 * The stocktake-overdue signal (spec §12), as a dot rather than a dashboard tile: raw material
 * drifts downward forever between counts, so a late count is a stock report quietly going wrong —
 * exactly the kind of thing that belongs beside the page that fixes it.
 */
export const StocktakeOverdueNavIndicator: React.FC = () => {
  const trpc = useTRPC();
  const inventoryAccess = useCan('inventory:read');
  const overdueQuery = useQuery({
    ...trpc.inventory.stocktakeOverdue.queryOptions(),
    enabled: inventoryAccess.can,
  });
  const overdue = (overdueQuery.data?.items ?? []).filter((row) => row.isOverdue);

  return overdue.length > 0 ? (
    <NavWarningDot
      label={`${overdue.map((row) => STOCKTAKE_SCOPE_LABELS[row.scope]).join(' and ')} ${overdue.length === 1 ? 'is' : 'are'} overdue for a count`}
    />
  ) : null;
};

/** Returns are settled per movement, so the dot counts the same unresolved rows as the PO chase list. */
export const ReturnsAwaitingCreditNavIndicator: React.FC = () => {
  const trpc = useTRPC();
  const purchaseOrderAccess = useCan('purchase_order:read');
  const returnsQuery = useQuery({
    ...trpc.purchaseOrders.returnsAwaitingCredit.queryOptions(),
    enabled: purchaseOrderAccess.can,
  });
  const count = returnsQuery.data?.items.length ?? 0;

  return count > 0 ? (
    <NavWarningDot label={`${count} ${plural(count, 'return is', 'returns are')} awaiting credit`} />
  ) : null;
};

export const FeedbackOpenNavIndicator: React.FC = () => {
  const trpc = useTRPC();
  const feedbackAccess = useCan('feedback:read');
  const openFeedbackQuery = useQuery({
    ...trpc.feedback.openCount.queryOptions(),
    enabled: feedbackAccess.can,
  });

  const openCount = openFeedbackQuery.data ?? 0;

  return openCount > 0 ? (
    <NavWarningDot label={`${openCount} open feedback ${plural(openCount, 'item needs', 'items need')} review`} />
  ) : null;
};
