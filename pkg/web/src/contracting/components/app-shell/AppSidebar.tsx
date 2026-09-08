import { useLocation } from '@tanstack/react-router';
import type React from 'react';
import { AppNavHelp } from '@/components/app-shell/AppNavHelp.js';
import { AppNavUser } from '@/components/app-shell/AppNavUser.js';
import { BusinessSidebarHeader } from '@/components/app-shell/BusinessSidebarHeader.js';
import { Sidebar, SidebarContent, SidebarFooter } from '@/components/ui/sidebar.js';
import { useCan } from '@/hooks/use-access.js';
import { useAuth } from '@/hooks/use-auth.js';
import { AppNavMain } from './AppNavMain.js';

type AppSidebarProps = React.ComponentProps<typeof Sidebar>;

export const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const { onSignOut, user } = useAuth();
  const canReadDirectory = useCan('contracting_directory:read').can;
  const canReadFleet = useCan('contracting_machine:read').can;
  const path = useLocation({ select: (location) => location.pathname });
  const helpTopic = path.startsWith('/contracting/customers')
    ? 'contractingCustomers'
    : path.startsWith('/contracting/work-types')
      ? 'contractingWorkTypes'
      : path.includes('/readings')
        ? 'contractingReadings'
        : path.includes('/categories')
          ? 'contractingCategories'
          : path.includes('/implements')
            ? 'contractingImplements'
            : path.startsWith('/contracting/fleet')
              ? 'contractingFleet'
              : 'contractingHome';

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <BusinessSidebarHeader activeBusiness="contracting" />
      <SidebarContent>
        <AppNavMain />
      </SidebarContent>
      <SidebarFooter>
        {canReadFleet || canReadDirectory ? <AppNavHelp topic={helpTopic} /> : null}
        <AppNavUser business="contracting" onSignOut={onSignOut} user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};
