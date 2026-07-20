import type { ReactNode } from 'react';

import { type AppTextInputProps, TextInput } from '@/components/ui/text-input';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { FieldShell } from './FieldShell';

export type TextFieldProps = {
  label?: ReactNode;
} & Omit<AppTextInputProps, 'multiline' | 'onBlur' | 'onChangeText' | 'value'>;

export function TextField({ className, label, ...inputProps }: TextFieldProps) {
  const field = useFieldContext<string>();
  const errors = getFieldErrors(field.state.meta.errors);

  return (
    <FieldShell errors={errors} label={label}>
      <TextInput
        className={`h-12 ${errors.length > 0 ? 'border-danger' : ''} ${className ?? ''}`}
        onBlur={field.handleBlur}
        onChangeText={field.handleChange}
        value={field.state.value}
        {...inputProps}
      />
    </FieldShell>
  );
}
