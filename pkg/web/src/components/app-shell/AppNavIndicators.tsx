import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { SidebarMenuBadge } from '@/components/ui/sidebar.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

const NavWarningDot: React.FC<{
  label: string;
}> = ({ label }) => (
  <SidebarMenuBadge
    aria-label={label}
    className="right-3 min-w-0 px-0 group-data-[collapsible=icon]:right-1.5 group-data-[collapsible=icon]:flex"
  >
    <span className="size-2 rounded-full bg-warning ring-2 ring-sidebar" />
  </SidebarMenuBadge>
);

export const QuotesPriorityNavIndicator: React.FC = () => {
  const trpc = useTRPC();
  const quoteAccess = useCan('quote:read');
  const priorityQuotesQuery = useQuery({
    ...trpc.quotes.priorityList.queryOptions(),
    enabled: quoteAccess.can,
  });

  return (priorityQuotesQuery.data?.length ?? 0) > 0 ? <NavWarningDot label="Quotes need jobs" /> : null;
};

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
  const urgent = (buyListQuery.data?.items ?? []).filter((item) =>
    item.reasons.some((reason) => reason === 'out-of-stock' || reason === 'below-minimum'),
  );

  return urgent.length > 0 ? <NavWarningDot label="Parts are out of stock or below minimum" /> : null;
};

export const FeedbackOpenNavIndicator: React.FC = () => {
  const trpc = useTRPC();
  const feedbackAccess = useCan('feedback:read');
  const openFeedbackQuery = useQuery({
    ...trpc.feedback.openCount.queryOptions(),
    enabled: feedbackAccess.can,
  });

  return (openFeedbackQuery.data ?? 0) > 0 ? <NavWarningDot label="Open feedback needs review" /> : null;
};
