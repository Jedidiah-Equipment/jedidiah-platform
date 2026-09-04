import { roleDescriptions, roleLabels } from '@pkg/domain';
import type { AppRole } from '@pkg/schema';
import { IconChevronDown } from '@tabler/icons-react';

import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';

type UserRoleMenuProps<R extends AppRole> = {
  disabled: boolean;
  id: string;
  onRoleChange: (role: R | null) => void;
  roles: readonly R[];
  value: R | null;
};

const NO_ROLE_VALUE = '__none__';

function parseMenuValue<R extends AppRole>(roles: readonly R[], menuValue: string): R | null {
  if (menuValue === NO_ROLE_VALUE) return null;

  const role = roles.find((candidate) => candidate === menuValue);

  if (!role) throw new Error(`Unknown role: ${menuValue}`);

  return role;
}

export function UserRoleMenu<R extends AppRole>({ disabled, id, onRoleChange, roles, value }: UserRoleMenuProps<R>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button className="w-full justify-between" disabled={disabled} id={id} type="button" variant="outline" />
        }
      >
        {value ? roleLabels[value] : 'No access'}
        <IconChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-72">
        <DropdownMenuRadioGroup
          onValueChange={(nextValue) => onRoleChange(parseMenuValue(roles, nextValue))}
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
}

export function UserRoleMenuItemContent({ appRole }: { appRole: AppRole }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="font-medium">{roleLabels[appRole]}</span>
      <span className="text-muted-foreground text-xs">{roleDescriptions[appRole]}</span>
    </span>
  );
}
