import { getRolePermissions, permissionLabels, roleLabels } from '@pkg/domain';
import { APP_ROLES, AppRole } from '@pkg/schema';
import { ChevronDownIcon } from 'lucide-react';
import type React from 'react';

import { PermissionBadge } from '@/components/PermissionBadge.js';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';

type UserRoleMenuProps = {
  disabled: boolean;
  id: string;
  onRoleChange: (role: AppRole) => void;
  value: AppRole;
};

export const UserRoleMenu: React.FC<UserRoleMenuProps> = ({ disabled, id, onRoleChange, value }) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={<Button className="w-full justify-between" disabled={disabled} id={id} type="button" variant="outline" />}
    >
      {roleLabels[value]}
      <ChevronDownIcon data-icon="inline-end" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-72">
      <DropdownMenuRadioGroup onValueChange={(nextValue) => onRoleChange(AppRole.parse(nextValue))} value={value}>
        <DropdownMenuGroup>
          {APP_ROLES.map((role) => (
            <DropdownMenuRadioItem className="items-start py-2 pr-8" key={role} value={role}>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{roleLabels[role]}</span>
                <span className="flex flex-wrap gap-1">
                  {getRolePermissions(role).map((permission) => (
                    <PermissionBadge key={permission}>{permissionLabels[permission]}</PermissionBadge>
                  ))}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);
