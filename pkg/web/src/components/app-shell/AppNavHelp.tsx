import { type HelpTopic, helpUrl } from '@pkg/domain';
import type React from 'react';

import { HelpIcon } from '@/components/help/index.js';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar.js';
import { getClientConfig } from '@/lib/app-config.js';

/**
 * Persistent Help affordance. It opens the docs page for the area the user is standing in, in a new
 * tab — the docs site is public, so nothing about the session travels with it. Nothing renders when
 * no docs site is configured; a dead Help link is worse than none.
 */
export const AppNavHelp: React.FC<{ topic: HelpTopic }> = ({ topic }) => {
  const { docsBaseUrl } = getClientConfig();

  if (!docsBaseUrl) {
    return null;
  }

  const href = helpUrl(docsBaseUrl, topic);

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
