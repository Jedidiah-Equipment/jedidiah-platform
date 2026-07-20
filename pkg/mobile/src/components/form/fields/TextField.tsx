import type { ReactNode } from 'react';

import { type AppTextInputProps, TextInput } from '@/components/ui/text-input';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { FieldShell } from './FieldShell';

export type TextFieldProps = {
  disabled?: boolean;
  label?: ReactNode;
  onValueCommit?: () => void;
} & Omit<AppTextInputProps, 'editable' | 'multiline' | 'onBlur' | 'onChangeText' | 'value'>;

export function TextField({ className, disabled = false, label, onValueCommit, ...inputProps }: TextFieldProps) {
  const field = useFieldContext<string>();
  const errors = getFieldErrors(field.state.meta.errors);

  return (
    <FieldShell errors={errors} label={label}>
      <TextInput
        className={`h-12 ${errors.length > 0 ? 'border-danger' : ''} ${disabled ? 'opacity-55' : ''} ${className ?? ''}`}
        editable={!disabled}
        onBlur={() => {
          field.handleBlur();
          onValueCommit?.();
        }}
        onChangeText={field.handleChange}
        value={field.state.value}
        {...inputProps}
      />
    </FieldShell>
  );
}
