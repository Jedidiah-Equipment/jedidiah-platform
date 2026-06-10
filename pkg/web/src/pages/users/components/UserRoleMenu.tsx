import { getRolePermissions, roleDescriptions, roleLabels } from '@pkg/domain';
import { APP_ROLES, AppRole } from '@pkg/schema';
import { IconChevronDown } from '@tabler/icons-react';
import type React from 'react';

import { PermissionBadge } from '@/components/common/PermissionBadge.js';
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
      <IconChevronDown data-icon="inline-end" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-72">
      <DropdownMenuRadioGroup onValueChange={(nextValue) => onRoleChange(AppRole.parse(nextValue))} value={value}>
        <DropdownMenuGroup>
          {APP_ROLES.map((role) => (
            <DropdownMenuRadioItem className="items-start py-2 pr-8" key={role} value={role}>
              <UserRoleMenuItemContent appRole={role} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

export function UserRoleMenuItemContent({ appRole }: { appRole: AppRole }) {
  const permissions = getRolePermissions(appRole);

  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="font-medium">{roleLabels[appRole]}</span>
      <span className="text-muted-foreground text-xs">{roleDescriptions[appRole]}</span>
      <span className="flex flex-wrap gap-1">
        {permissions.length > 0 ? (
          permissions.map((permission) => <PermissionBadge key={permission} permission={permission} />)
        ) : (
          <span className="text-muted-foreground text-xs">No sign-in permissions</span>
        )}
      </span>
    </span>
  );
}
