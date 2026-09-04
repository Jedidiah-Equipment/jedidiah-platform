import type React from 'react';

import { AppNavUser } from '@/components/app-shell/AppNavUser.js';
import { BusinessSidebarHeader } from '@/components/app-shell/BusinessSidebarHeader.js';
import { Sidebar, SidebarContent, SidebarFooter } from '@/components/ui/sidebar.js';
import { useAccess } from '@/hooks/use-access.js';
import { useAuth } from '@/hooks/use-auth.js';

type AppSidebarProps = React.ComponentProps<typeof Sidebar>;

export const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const { onSignOut, user } = useAuth();
  const access = useAccess().data;
  const hasBothBusinesses = access?.equipmentRole != null && access.contractingRole != null;

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <BusinessSidebarHeader activeBusiness="contracting" hasBothBusinesses={hasBothBusinesses} />
      <SidebarContent />
      <SidebarFooter>
        <AppNavUser activeRole={access?.contractingRole} businessName="Contracting" onSignOut={onSignOut} user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};
