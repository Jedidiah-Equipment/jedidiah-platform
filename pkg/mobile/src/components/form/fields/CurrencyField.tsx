import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { FieldShell } from './FieldShell';

export type CurrencyFieldProps = {
  disabled?: boolean;
  label?: ReactNode;
  onValueCommit?: () => void;
  placeholder?: string;
};

/** ZAR amount input that retains its raw string until form validation parses it. */
export function CurrencyField({ disabled = false, label, onValueCommit, placeholder = '0.00' }: CurrencyFieldProps) {
  const field = useFieldContext<number | string>();
  const errors = getFieldErrors(field.state.meta.errors);
  const value = field.state.value;

  return (
    <FieldShell errors={errors} label={label}>
      <View
        className={`h-12 flex-row items-center rounded-xl border bg-surface px-3 ${
          errors.length > 0 ? 'border-danger' : 'border-border'
        } ${disabled ? 'opacity-55' : ''}`}
      >
        <Text className="mr-2 text-sm text-muted-foreground" mono>
          R
        </Text>
        <TextInput
          className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 py-0"
          editable={!disabled}
          keyboardType="decimal-pad"
          onBlur={() => {
            field.handleBlur();
            onValueCommit?.();
          }}
          onChangeText={(nextValue) =>
            field.handleChange(
              typeof value === 'number' ? (nextValue === '' ? Number.NaN : Number(nextValue)) : nextValue,
            )
          }
          placeholder={placeholder}
          value={typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value}
        />
      </View>
    </FieldShell>
  );
}
