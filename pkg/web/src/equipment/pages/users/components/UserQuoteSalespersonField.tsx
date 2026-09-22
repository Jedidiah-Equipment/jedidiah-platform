import type React from 'react';
import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field.js';

type UserQuoteSalespersonFieldProps = {
  checked: boolean;
  isPending: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export const UserQuoteSalespersonField: React.FC<UserQuoteSalespersonFieldProps> = ({
  checked,
  isPending,
  onCheckedChange,
}) => {
  const fieldId = useId();

  return (
    <Field data-disabled={isPending} orientation="horizontal">
      <Checkbox
        checked={checked}
        disabled={isPending}
        id={fieldId}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      <FieldContent>
        <FieldLabel htmlFor={fieldId}>Quote salesperson</FieldLabel>
        <FieldDescription>
          Lists this person in the Salesperson picker on Quotes. It changes nothing about what they can see or do.
        </FieldDescription>
      </FieldContent>
    </Field>
  );
};
