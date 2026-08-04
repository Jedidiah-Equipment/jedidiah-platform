import { helpUrl } from '@pkg/domain';
import { IconHelpCircle } from '@tabler/icons-react';
import { useLocation } from '@tanstack/react-router';
import type React from 'react';

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar.js';
import { getClientConfig } from '@/lib/app-config.js';
import { helpTopicForPath } from '@/lib/help-topics.js';

/**
 * Persistent Help affordance. It opens the docs page for the area the user is standing in, in a new
 * tab — the docs site is public, so nothing about the session travels with it.
 */
export const AppNavHelp: React.FC = () => {
  const pathname = useLocation({ select: (location) => location.pathname });
  const href = helpUrl(getClientConfig().docsBaseUrl, helpTopicForPath(pathname));

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          className="[&_svg]:size-5"
          render={<a href={href} rel="noreferrer" target="_blank" />}
          tooltip="Help"
        >
          <IconHelpCircle />
          <span>Help</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
