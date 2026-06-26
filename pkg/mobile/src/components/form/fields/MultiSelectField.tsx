import { IconPlus, IconX } from '@tabler/icons-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { FieldShell } from './FieldShell';

type MultiSelectFieldOption = {
  label: string;
  value: string;
};

export type MultiSelectFieldProps = {
  emptyMessage?: string;
  label?: ReactNode;
  /** Cap for the scrollable list of remaining options. */
  listMaxHeight?: number;
  options: readonly MultiSelectFieldOption[];
};

/**
 * Inline multi-select bound to a string[] form value — the native stand-in for web's
 * `MultiComboboxField`. Picked values surface as removable badges above a scrollable list
 * of the remaining options; tapping a row adds it (and drops it from the list), tapping a
 * badge's ✕ removes it. The list shrinks as you select, so it rarely needs to scroll far.
 */
export function MultiSelectField({
  emptyMessage = 'No options available.',
  label,
  listMaxHeight = 220,
  options,
}: MultiSelectFieldProps) {
  const field = useFieldContext<string[]>();
  const errors = getFieldErrors(field.state.meta.errors);
  const selected = field.state.value ?? [];
  const labelOf = new Map(options.map((option) => [option.value, option.label]));
  const available = options.filter((option) => !selected.includes(option.value));

  const add = (value: string) => field.handleChange(selected.includes(value) ? selected : [...selected, value]);
  const remove = (value: string) => field.handleChange(selected.filter((entry) => entry !== value));

  return (
    <FieldShell errors={errors} label={label}>
      {selected.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {selected.map((value) => (
            <Pressable
              accessibilityLabel={`Remove ${labelOf.get(value) ?? value}`}
              accessibilityRole="button"
              className="flex-row items-center gap-2 rounded-full border border-primary bg-primary/10 px-4 py-2 active:opacity-70"
              key={value}
              onPress={() => remove(value)}
            >
              <Text className="text-xs text-foreground" weight="semibold">
                {labelOf.get(value) ?? value}
              </Text>
              <Icon className="text-primary" icon={IconX} size={14} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View className="overflow-hidden rounded-xl border border-border" style={{ maxHeight: listMaxHeight }}>
        {available.length === 0 ? (
          <View className="px-3 py-3">
            <Text className="text-sm text-muted-foreground">
              {selected.length > 0 ? 'All options selected.' : emptyMessage}
            </Text>
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {available.map((option, index) => (
              <Pressable
                accessibilityRole="button"
                className={`flex-row items-center justify-between gap-3 px-3 py-3 active:bg-muted ${index > 0 ? 'border-t border-border' : ''}`}
                key={option.value}
                onPress={() => add(option.value)}
              >
                <Text className="flex-1 text-sm text-surface-foreground" numberOfLines={1}>
                  {option.label}
                </Text>
                <Icon className="text-muted-foreground" icon={IconPlus} size={18} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </FieldShell>
  );
}
