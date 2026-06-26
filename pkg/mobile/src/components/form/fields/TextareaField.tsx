import type { ReactNode } from 'react';

import { type AppTextInputProps, TextInput } from '@/components/ui/text-input';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { FieldShell } from './FieldShell';

type TextareaFieldProps = {
  label?: ReactNode;
} & Omit<AppTextInputProps, 'multiline' | 'onBlur' | 'onChangeText' | 'value'>;

/** Multi-line text field bound to a string form value. Mirrors web's `TextareaField`. */
export function TextareaField({ label, className, rows = 5, ...inputProps }: TextareaFieldProps & { rows?: number }) {
  const field = useFieldContext<string>();
  const errors = getFieldErrors(field.state.meta.errors);

  return (
    <FieldShell errors={errors} label={label}>
      <TextInput
        className={`${errors.length > 0 ? 'border-danger' : ''} ${className ?? ''}`}
        multiline
        numberOfLines={rows}
        onBlur={field.handleBlur}
        onChangeText={field.handleChange}
        style={{ minHeight: rows * 22 }}
        textAlignVertical="top"
        value={field.state.value}
        {...inputProps}
      />
    </FieldShell>
  );
}
