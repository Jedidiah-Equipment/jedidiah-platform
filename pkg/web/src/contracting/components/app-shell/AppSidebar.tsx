import { IconCategory, IconTool, IconTractor } from '@tabler/icons-react';
import { Link, useLocation } from '@tanstack/react-router';
import type React from 'react';
import { AppNavHelp } from '@/components/app-shell/AppNavHelp.js';
import { AppNavUser } from '@/components/app-shell/AppNavUser.js';
import { BusinessSidebarHeader } from '@/components/app-shell/BusinessSidebarHeader.js';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar.js';
import { useCan } from '@/hooks/use-access.js';
import { useAuth } from '@/hooks/use-auth.js';

type AppSidebarProps = React.ComponentProps<typeof Sidebar>;

export const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const { onSignOut, user } = useAuth();
  const { setOpenMobile } = useSidebar();
  const canReadFleet = useCan('contracting_machine:read').can;
  const path = useLocation({ select: (location) => location.pathname });
  const helpTopic = path.includes('/categories')
    ? 'contractingCategories'
    : path.includes('/implements')
      ? 'contractingImplements'
      : 'contractingFleet';

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <BusinessSidebarHeader activeBusiness="contracting" />
      <SidebarContent>
        {canReadFleet ? (
          <SidebarGroup>
            <SidebarMenu>
              {[
                { to: '/contracting/fleet', label: 'Machines', icon: IconTractor },
                { to: '/contracting/fleet/categories', label: 'Categories', icon: IconCategory },
                { to: '/contracting/fleet/implements', label: 'Implements', icon: IconTool },
              ].map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    render={<Link to={item.to} onClick={() => setOpenMobile(false)} />}
                    tooltip={item.label}
                    isActive={
                      item.to === '/contracting/fleet'
                        ? path.startsWith(item.to) && !path.includes('/categories') && !path.includes('/implements')
                        : path.startsWith(item.to)
                    }
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        {canReadFleet ? <AppNavHelp topic={helpTopic} /> : null}
        <AppNavUser business="contracting" onSignOut={onSignOut} user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};
