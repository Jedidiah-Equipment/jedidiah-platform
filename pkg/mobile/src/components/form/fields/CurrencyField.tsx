import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { FieldShell } from './FieldShell';

export type CurrencyFieldProps = {
  label?: ReactNode;
  placeholder?: string;
};

/** ZAR amount input that retains its raw string until form validation parses it. */
export function CurrencyField({ label, placeholder = '0.00' }: CurrencyFieldProps) {
  const field = useFieldContext<string>();
  const errors = getFieldErrors(field.state.meta.errors);

  return (
    <FieldShell errors={errors} label={label}>
      <View
        className={`h-12 flex-row items-center rounded-xl border bg-surface px-3 ${
          errors.length > 0 ? 'border-danger' : 'border-border'
        }`}
      >
        <Text className="mr-2 text-sm text-muted-foreground" mono>
          R
        </Text>
        <TextInput
          className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 py-0"
          keyboardType="decimal-pad"
          onBlur={field.handleBlur}
          onChangeText={field.handleChange}
          placeholder={placeholder}
          value={field.state.value}
        />
      </View>
    </FieldShell>
  );
}
