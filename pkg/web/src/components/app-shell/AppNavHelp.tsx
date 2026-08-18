import { helpUrl } from '@pkg/domain';
import { useLocation } from '@tanstack/react-router';
import type React from 'react';

import { HelpIcon } from '@/components/help/index.js';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar.js';
import { getClientConfig } from '@/lib/app-config.js';
import { helpTopicForPath } from '@/lib/help-topics.js';

/**
 * Persistent Help affordance. It opens the docs page for the area the user is standing in, in a new
 * tab — the docs site is public, so nothing about the session travels with it. Nothing renders when
 * no docs site is configured; a dead Help link is worse than none.
 */
export const AppNavHelp: React.FC = () => {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { docsBaseUrl } = getClientConfig();

  if (!docsBaseUrl) {
    return null;
  }

  const href = helpUrl(docsBaseUrl, helpTopicForPath(pathname));

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          className="[&_svg]:size-5"
          render={<a href={href} rel="noreferrer" target="_blank" />}
          tooltip="Help"
        >
          <HelpIcon />
          <span>Help</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
