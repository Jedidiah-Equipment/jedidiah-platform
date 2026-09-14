import type { AppRole } from '@pkg/schema';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { UserRoleMenu } from './UserRoleMenu.js';

type RoleFieldProps<R extends AppRole> = {
  description?: string | undefined;
  disabled: boolean;
  errors: Array<{ message?: string } | undefined>;
  label?: string;
  name: string;
  roles: readonly R[];
  /** May name a role outside `roles` when it is derived rather than chosen — a spanning super-admin. */
  value: AppRole | null;
  onRoleChange: (role: R | null) => void;
};

export function RoleField<R extends AppRole>({
  description,
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
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={errors} />
    </Field>
  );
}
