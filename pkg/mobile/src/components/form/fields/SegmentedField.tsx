import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { FieldShell } from './FieldShell';

type SegmentedFieldOption = {
  label: string;
  value: string;
};

export type SegmentedFieldProps = {
  label?: ReactNode;
  options: readonly SegmentedFieldOption[];
};

/**
 * A row of equal-width pills for a small, fixed set of mutually-exclusive string
 * values — the native idiom for web's dropdown `SelectField`. Reuses the visual
 * pattern of the theme toggle in ProfileMenu.
 */
export function SegmentedField({ label, options }: SegmentedFieldProps) {
  const field = useFieldContext<string>();
  const errors = getFieldErrors(field.state.meta.errors);

  return (
    <FieldShell errors={errors} label={label}>
      <View className="flex-row rounded-xl border border-border bg-muted p-1">
        {options.map((option) => {
          const selected = field.state.value === option.value;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`flex-1 items-center rounded-lg py-2 ${selected ? 'bg-surface' : ''}`}
              key={option.value}
              onPress={() => field.handleChange(option.value)}
            >
              <Text
                className={`text-xs ${selected ? 'text-surface-foreground' : 'text-muted-foreground'}`}
                weight={selected ? 'semibold' : 'regular'}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </FieldShell>
  );
}
