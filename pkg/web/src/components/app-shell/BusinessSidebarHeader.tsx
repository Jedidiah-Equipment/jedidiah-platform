import { type Business, hasBothBusinessAccess } from '@pkg/domain';
import { IconBuildingFactory, IconBuildingWarehouse, IconCheck, IconSelector } from '@tabler/icons-react';
import { Link, useNavigate } from '@tanstack/react-router';
import type React from 'react';

import { AppBrand } from '@/components/common/AppBrand.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar.js';
import { useAccess } from '@/hooks/use-access.js';

type BusinessSidebarHeaderProps = {
  activeBusiness: Business;
};

export const BusinessSidebarHeader: React.FC<BusinessSidebarHeaderProps> = ({ activeBusiness }) => {
  const navigate = useNavigate();
  const hasBothBusinesses = hasBothBusinessAccess(useAccess().data);
  const home = activeBusiness === 'contracting' ? '/contracting' : '/equipment/dashboard';

  return (
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
                  {activeBusiness === 'equipment' ? <IconCheck className="ml-auto" /> : null}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: '/contracting' })}>
                  <IconBuildingWarehouse />
                  Jedidiah Contracting
                  {activeBusiness === 'contracting' ? <IconCheck className="ml-auto" /> : null}
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
  );
};
