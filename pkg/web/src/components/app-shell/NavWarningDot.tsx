import type React from 'react';

import { SidebarMenuBadge } from '@/components/ui/sidebar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';

/**
 * A dot says only that something is waiting; the tooltip says what and how many, so nobody has to
 * open the page to find out. The badge is `pointer-events-none` by default — it has to take hover
 * back to be a tooltip trigger at all, and a click still falls through to the nav link underneath.
 */
export const NavWarningDot: React.FC<{
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
