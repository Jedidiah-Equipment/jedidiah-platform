import { Link } from '@tanstack/react-router';
import type React from 'react';
import { AppNavMain } from '@/components/app-shell/AppNavMain.js';
import { AppNavUser } from '@/components/app-shell/AppNavUser.js';
import { SidebarAssistant } from '@/components/assistant-ui/SidebarAssistant.js';
import { AppBrand } from '@/components/common/AppBrand.js';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar.js';
import { useAuth } from '@/hooks/use-auth.js';

type AppSidebarProps = React.ComponentProps<typeof Sidebar>;

export const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const { onSignOut, session, user } = useAuth();

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/dashboard" />} size="lg">
              <AppBrand size="sm" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <AppNavMain />
      </SidebarContent>
      <SidebarFooter>
        <SidebarAssistant enabled={session?.user.assistantEnabled === true} />
        <AppNavUser onSignOut={onSignOut} user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};
