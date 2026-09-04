import { roleDescriptions, roleLabels } from '@pkg/domain';
import { APP_ROLES, AppRole } from '@pkg/schema';
import { IconChevronDown } from '@tabler/icons-react';
import type React from 'react';

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
  onRoleChange: (role: AppRole | null) => void;
  roles?: readonly AppRole[];
  value: AppRole | null;
};

const NO_ROLE_VALUE = '__none__';

export const UserRoleMenu: React.FC<UserRoleMenuProps> = ({ disabled, id, onRoleChange, roles = APP_ROLES, value }) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={<Button className="w-full justify-between" disabled={disabled} id={id} type="button" variant="outline" />}
    >
      {value ? roleLabels[value] : 'No access'}
      <IconChevronDown data-icon="inline-end" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="min-w-72">
      <DropdownMenuRadioGroup
        onValueChange={(nextValue) => onRoleChange(nextValue === NO_ROLE_VALUE ? null : AppRole.parse(nextValue))}
        value={value ?? NO_ROLE_VALUE}
      >
        <DropdownMenuGroup>
          <DropdownMenuRadioItem className="items-start py-2 pr-8" closeOnClick value={NO_ROLE_VALUE}>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-medium">No access</span>
              <span className="text-muted-foreground text-xs">No role in this business.</span>
            </span>
          </DropdownMenuRadioItem>
          {roles.map((role) => (
            <DropdownMenuRadioItem className="items-start py-2 pr-8" closeOnClick key={role} value={role}>
              <UserRoleMenuItemContent appRole={role} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

export function UserRoleMenuItemContent({ appRole }: { appRole: AppRole }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="font-medium">{roleLabels[appRole]}</span>
      <span className="text-muted-foreground text-xs">{roleDescriptions[appRole]}</span>
    </span>
  );
}
