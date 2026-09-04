import type { AppRole } from '@pkg/schema';
import type React from 'react';

import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { UserRoleMenu } from './UserRoleMenu.js';

type RoleFieldProps = {
  disabled: boolean;
  errors: Array<{ message?: string } | undefined>;
  label?: string;
  name: string;
  roles?: readonly AppRole[];
  value: AppRole | null;
  onRoleChange: (role: AppRole | null) => void;
};

export const RoleField: React.FC<RoleFieldProps> = ({
  disabled,
  errors,
  label = 'Role',
  name,
  onRoleChange,
  roles,
  value,
}) => (
  <Field data-invalid={errors.length > 0}>
    <FieldLabel htmlFor={name}>{label}</FieldLabel>
    <UserRoleMenu
      disabled={disabled}
      id={name}
      onRoleChange={onRoleChange}
      {...(roles ? { roles } : {})}
      value={value}
    />
    <FieldError errors={errors} />
  </Field>
);
