import { Link } from '@tanstack/react-router';
import type React from 'react';

import { AppBrand } from '@/components/AppBrand.js';
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
              <AppBrand size="sm" />
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
