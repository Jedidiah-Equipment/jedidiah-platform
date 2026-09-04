import type React from 'react';

import { AppNavUser } from '@/components/app-shell/AppNavUser.js';
import { BusinessSidebarHeader } from '@/components/app-shell/BusinessSidebarHeader.js';
import { Sidebar, SidebarContent, SidebarFooter } from '@/components/ui/sidebar.js';
import { useAuth } from '@/hooks/use-auth.js';

type AppSidebarProps = React.ComponentProps<typeof Sidebar>;

export const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const { onSignOut, user } = useAuth();

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <BusinessSidebarHeader activeBusiness="contracting" />
      <SidebarContent />
      <SidebarFooter>
        <AppNavUser business="contracting" onSignOut={onSignOut} user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};
