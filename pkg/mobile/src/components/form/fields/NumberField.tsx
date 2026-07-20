import type { ReactNode } from 'react';

import { TextInput } from '@/components/ui/text-input';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { FieldShell } from './FieldShell';

export type NumberFieldProps = {
  disabled?: boolean;
  label?: ReactNode;
  onValueCommit?: () => void;
  placeholder?: string;
};

export function NumberField({ disabled = false, label, onValueCommit, placeholder = '0' }: NumberFieldProps) {
  const field = useFieldContext<number>();
  const errors = getFieldErrors(field.state.meta.errors);

  return (
    <FieldShell errors={errors} label={label}>
      <TextInput
        className={`h-12 ${errors.length > 0 ? 'border-danger' : ''} ${disabled ? 'opacity-55' : ''}`}
        editable={!disabled}
        keyboardType="decimal-pad"
        onBlur={() => {
          field.handleBlur();
          onValueCommit?.();
        }}
        onChangeText={(value) => field.handleChange(value.trim() === '' ? Number.NaN : Number(value))}
        placeholder={placeholder}
        value={Number.isFinite(field.state.value) ? String(field.state.value) : ''}
      />
    </FieldShell>
  );
}
