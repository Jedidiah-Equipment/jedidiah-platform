import { type ReactNode, useEffect, useState } from 'react';

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
  const canonicalValue = Number.isFinite(field.state.value) ? String(field.state.value) : '';
  const [draftValue, setDraftValue] = useState(canonicalValue);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraftValue(canonicalValue);
  }, [canonicalValue, focused]);

  return (
    <FieldShell errors={errors} label={label}>
      <TextInput
        className={`h-12 ${errors.length > 0 ? 'border-danger' : ''} ${disabled ? 'opacity-55' : ''}`}
        editable={!disabled}
        keyboardType="decimal-pad"
        onBlur={() => {
          setFocused(false);
          field.handleBlur();
          onValueCommit?.();
        }}
        onChangeText={(value) => {
          setDraftValue(value);
          field.handleChange(value.trim() === '' ? Number.NaN : Number(value));
        }}
        onFocus={() => {
          setDraftValue(canonicalValue);
          setFocused(true);
        }}
        placeholder={placeholder}
        value={focused ? draftValue : canonicalValue}
      />
    </FieldShell>
  );
}
