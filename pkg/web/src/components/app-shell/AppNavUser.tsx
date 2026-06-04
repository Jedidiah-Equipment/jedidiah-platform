import { departmentLabels, roleLabels } from '@pkg/domain';
import { IconBuilding, IconLogout, IconSelector, IconShield } from '@tabler/icons-react';
import type React from 'react';

import { DepartmentIcon } from '@/components/departments/index.js';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar.js';
import { useAccess } from '@/hooks/use-access.js';

type AppNavUserProps = {
  user: {
    name: string;
    email: string;
    initials: string;
    thumbnailDataUrl?: string | null;
  };
  onSignOut: () => void | Promise<void>;
};

export const AppNavUser: React.FC<AppNavUserProps> = ({ user, onSignOut }) => {
  const { isMobile } = useSidebar();
  const accessQuery = useAccess();
  const access = accessQuery.data;
  const primaryDepartment = access?.departments[0];
  const departmentLabel = access?.departments.length
    ? access.departments.map((department) => departmentLabels[department]).join(', ')
    : 'None';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton className="aria-expanded:bg-muted" size="lg" />}>
            <Avatar>
              {user.thumbnailDataUrl ? <AvatarImage alt="" src={user.thumbnailDataUrl} /> : null}
              <AvatarFallback>{user.initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
            <IconSelector className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar>
                    {user.thumbnailDataUrl ? <AvatarImage alt="" src={user.thumbnailDataUrl} /> : null}
                    <AvatarFallback>{user.initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <IconShield />
                <span className="flex min-w-0 flex-col">
                  <span>Role</span>
                  <span className="truncate text-muted-foreground text-xs">
                    {access ? roleLabels[access.role] : 'Loading'}
                  </span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                {primaryDepartment ? <DepartmentIcon department={primaryDepartment} /> : <IconBuilding />}
                <span className="flex min-w-0 flex-col">
                  <span>Department</span>
                  <span className="truncate text-muted-foreground text-xs">{departmentLabel}</span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut}>
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
