import { APP_ROLES, AppRole } from '@pkg/schema';
import type React from 'react';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { roleLabels } from './role-labels.js';

type UserRoleSelectProps = {
  disabled: boolean;
  onRoleChange: (role: AppRole) => void;
  value: AppRole;
};

export const UserRoleSelect: React.FC<UserRoleSelectProps> = ({ disabled, onRoleChange, value }) => (
  <Select
    disabled={disabled}
    items={roleLabels}
    onValueChange={(nextValue) => onRoleChange(AppRole.parse(nextValue))}
    value={value}
  >
    <SelectTrigger className="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        {APP_ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {roleLabels[role]}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
);
