import type { ComponentProps } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';

import { QUOTE_LIST_CARD_HEIGHT_PX } from './dashboard-widget-layout.js';

export function DashboardList({ className, ...props }: ComponentProps<'ul'>) {
  return <ul className={cn('flex flex-col divide-y', className)} data-slot="dashboard-list" {...props} />;
}

export function DashboardListItem({ className, ...props }: ComponentProps<'li'>) {
  return <li className={cn('py-3 first:pt-0 last:pb-0', className)} data-slot="dashboard-list-item" {...props} />;
}

export function DashboardListScrollArea({ className, style, ...props }: ComponentProps<typeof ScrollArea>) {
  return (
    <ScrollArea
      className={cn('min-h-0', className)}
      style={{ ...style, height: QUOTE_LIST_CARD_HEIGHT_PX }}
      {...props}
    />
  );
}
