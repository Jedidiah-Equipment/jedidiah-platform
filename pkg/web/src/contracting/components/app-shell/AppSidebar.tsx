import { useLocation } from '@tanstack/react-router';
import type React from 'react';
import { AppNavHelp } from '@/components/app-shell/AppNavHelp.js';
import { AppNavUser } from '@/components/app-shell/AppNavUser.js';
import { BusinessSidebarHeader } from '@/components/app-shell/BusinessSidebarHeader.js';
import { Sidebar, SidebarContent, SidebarFooter } from '@/components/ui/sidebar.js';
import { helpTopicForPath } from '@/contracting/lib/help-topics.js';
import { useAuth } from '@/hooks/use-auth.js';
import { AppNavMain } from './AppNavMain.js';

type AppSidebarProps = React.ComponentProps<typeof Sidebar>;

export const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const { onSignOut, user } = useAuth();
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <BusinessSidebarHeader activeBusiness="contracting" />
      <SidebarContent>
        <AppNavMain />
      </SidebarContent>
      <SidebarFooter>
        <AppNavHelp topic={helpTopicForPath(pathname)} />
        <AppNavUser business="contracting" onSignOut={onSignOut} user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};
