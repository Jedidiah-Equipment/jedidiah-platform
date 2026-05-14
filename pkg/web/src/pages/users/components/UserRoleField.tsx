import type { AppRole } from '@pkg/schema';
import type React from 'react';

import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { UserRoleSelect } from './UserRoleSelect.js';

type RoleFieldProps = {
  disabled: boolean;
  errors: Array<{ message?: string } | undefined>;
  name: string;
  value: AppRole;
  onRoleChange: (role: AppRole) => void;
};

export const RoleField: React.FC<RoleFieldProps> = ({ disabled, errors, name, onRoleChange, value }) => (
  <Field data-invalid={errors.length > 0}>
    <FieldLabel htmlFor={name}>Role</FieldLabel>
    <UserRoleSelect disabled={disabled} onRoleChange={onRoleChange} value={value} />
    <FieldError errors={errors} />
  </Field>
);
