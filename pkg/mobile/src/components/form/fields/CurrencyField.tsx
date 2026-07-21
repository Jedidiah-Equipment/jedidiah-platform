import { type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { fieldStateClassNames } from '../utils/field-style';
import { FieldShell } from './FieldShell';

export type CurrencyFieldProps = {
  disabled?: boolean;
  label?: ReactNode;
  onValueCommit?: () => void;
  placeholder?: string;
};

/** ZAR amount input; keeps a local draft string while focused, NaN in form state when empty. */
export function CurrencyField({ disabled = false, label, onValueCommit, placeholder = '0.00' }: CurrencyFieldProps) {
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
      <View
        className={`h-12 flex-row items-center rounded-xl border bg-surface px-3 ${fieldStateClassNames({
          disabled,
          hasErrors: errors.length > 0,
        })}`}
      >
        <Text className="mr-2 text-sm text-muted-foreground" mono>
          R
        </Text>
        <TextInput
          className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 py-0"
          editable={!disabled}
          keyboardType="decimal-pad"
          mono
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
      </View>
    </FieldShell>
  );
}
