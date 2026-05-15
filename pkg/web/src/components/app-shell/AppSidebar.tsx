import { Link } from '@tanstack/react-router';
import type React from 'react';

import logoSmallUrl from '@/assets/logo_small.png';
import { AppNavMain } from '@/components/app-shell/AppNavMain.js';
import { AppNavUser } from '@/components/app-shell/AppNavUser.js';
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
  const { onSignOut, user } = useAuth();

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/dashboard" />} size="lg">
              <div className="flex aspect-square size-6 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary">
                <img alt="" className="size-full object-cover" src={logoSmallUrl} />
              </div>
              <div className="min-w-0 flex-1 gap-0 truncate whitespace-nowrap text-left text-lg font-medium leading-none">
                <span>Jedidiah</span>
                <span className="text-primary">Ops</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <AppNavMain />
      </SidebarContent>
      <SidebarFooter>
        <AppNavUser onSignOut={onSignOut} user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};
