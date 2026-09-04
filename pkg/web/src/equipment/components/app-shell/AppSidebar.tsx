import type React from 'react';
import { AppNavUser } from '@/components/app-shell/AppNavUser.js';
import { BusinessSidebarHeader } from '@/components/app-shell/BusinessSidebarHeader.js';
import { Sidebar, SidebarContent, SidebarFooter } from '@/components/ui/sidebar.js';
import { AppNavHelp } from '@/equipment/components/app-shell/AppNavHelp.js';
import { AppNavMain } from '@/equipment/components/app-shell/AppNavMain.js';
import { SidebarAssistant } from '@/equipment/components/assistant-ui/SidebarAssistant.js';
import { useAuth } from '@/hooks/use-auth.js';

type AppSidebarProps = React.ComponentProps<typeof Sidebar>;

export const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const { onSignOut, session, user } = useAuth();

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <BusinessSidebarHeader activeBusiness="equipment" />
      <SidebarContent>
        <AppNavMain />
      </SidebarContent>
      <SidebarFooter>
        <AppNavHelp />
        <SidebarAssistant enabled={session?.user.assistantEnabled === true} />
        <AppNavUser business="equipment" onSignOut={onSignOut} user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};
