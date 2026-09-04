import type { AppRole } from '@pkg/schema';

import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { UserRoleMenu } from './UserRoleMenu.js';

type RoleFieldProps<R extends AppRole> = {
  disabled: boolean;
  errors: Array<{ message?: string } | undefined>;
  label?: string;
  name: string;
  roles: readonly R[];
  value: R | null;
  onRoleChange: (role: R | null) => void;
};

export function RoleField<R extends AppRole>({
  disabled,
  errors,
  label = 'Role',
  name,
  onRoleChange,
  roles,
  value,
}: RoleFieldProps<R>) {
  return (
    <Field data-invalid={errors.length > 0}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <UserRoleMenu disabled={disabled} id={name} onRoleChange={onRoleChange} roles={roles} value={value} />
      <FieldError errors={errors} />
    </Field>
  );
}
