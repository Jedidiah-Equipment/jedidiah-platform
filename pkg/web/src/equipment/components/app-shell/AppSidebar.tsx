import { IconBuildingFactory, IconBuildingWarehouse, IconCheck, IconSelector } from '@tabler/icons-react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { AppBrand } from '@/components/common/AppBrand.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar.js';
import { AppNavHelp } from '@/equipment/components/app-shell/AppNavHelp.js';
import { AppNavMain } from '@/equipment/components/app-shell/AppNavMain.js';
import { AppNavUser } from '@/equipment/components/app-shell/AppNavUser.js';
import { SidebarAssistant } from '@/equipment/components/assistant-ui/SidebarAssistant.js';
import { useAccess } from '@/hooks/use-access.js';
import { useAuth } from '@/hooks/use-auth.js';

type AppSidebarProps = React.ComponentProps<typeof Sidebar>;

export const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const { onSignOut, session, user } = useAuth();
  const access = useAccess().data;
  const navigate = useNavigate();
  const isContracting = useLocation({ select: (location) => location.pathname.startsWith('/contracting') });
  const hasBothBusinesses = access?.equipmentRole != null && access.contractingRole != null;
  const home = isContracting ? '/contracting' : '/equipment/dashboard';

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {hasBothBusinesses ? (
              <DropdownMenu>
                <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                  <AppBrand size="sm" />
                  <IconSelector className="ml-auto" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-56">
                  <DropdownMenuLabel>Business</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => navigate({ to: '/equipment/dashboard' })}>
                    <IconBuildingFactory />
                    Jedidiah Equipment
                    {!isContracting ? <IconCheck className="ml-auto" /> : null}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate({ to: '/contracting' })}>
                    <IconBuildingWarehouse />
                    Jedidiah Contracting
                    {isContracting ? <IconCheck className="ml-auto" /> : null}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <SidebarMenuButton render={<Link to={home} />} size="lg">
                <AppBrand size="sm" />
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>{isContracting ? null : <AppNavMain />}</SidebarContent>
      <SidebarFooter>
        {isContracting ? null : <AppNavHelp />}
        {isContracting ? null : <SidebarAssistant enabled={session?.user.assistantEnabled === true} />}
        <AppNavUser onSignOut={onSignOut} user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};
