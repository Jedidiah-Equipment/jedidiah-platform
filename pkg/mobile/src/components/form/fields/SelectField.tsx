import { IconCheck, IconChevronDown } from '@tabler/icons-react-native';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { fieldStateClassNames } from '../utils/field-style';
import { FieldShell } from './FieldShell';

type SelectFieldOption = {
  label: string;
  value: string;
};

export type SelectFieldProps = {
  disabled?: boolean;
  emptyMessage?: string;
  label?: ReactNode;
  onValueSelect?: (value: string) => boolean | undefined;
  onValueCommit?: () => void;
  options: readonly SelectFieldOption[];
  placeholder?: string;
};

/** Inline expanding select for a compact list of string options. */
export function SelectField({
  disabled = false,
  emptyMessage = 'No options available.',
  label,
  onValueSelect,
  onValueCommit,
  options,
  placeholder = 'Select an option',
}: SelectFieldProps) {
  const field = useFieldContext<string>();
  const errors = getFieldErrors(field.state.meta.errors);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === field.state.value);

  const choose = (value: string) => {
    setOpen(false);
    if (value === field.state.value || onValueSelect?.(value) === false) return;

    field.handleChange(value);
    onValueCommit?.();
  };

  return (
    <FieldShell errors={errors} label={label}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        className={`h-12 flex-row items-center justify-between gap-3 rounded-xl border bg-surface px-3 ${fieldStateClassNames(
          { disabled, hasErrors: errors.length > 0 },
        )} ${disabled ? '' : 'active:bg-muted'}`}
        disabled={disabled}
        onPress={() => setOpen((value) => !value)}
      >
        <Text className={`text-sm ${selected ? 'text-surface-foreground' : 'text-muted-foreground'}`} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Icon className="text-muted-foreground" icon={IconChevronDown} size={16} />
      </Pressable>

      {open ? (
        <View className="overflow-hidden rounded-xl border border-border bg-surface">
          {options.length === 0 ? (
            <View className="px-3 py-3">
              <Text className="text-sm text-muted-foreground">{emptyMessage}</Text>
            </View>
          ) : (
            options.map((option, index) => {
              const active = option.value === field.state.value;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`flex-row items-center justify-between gap-3 px-3 py-3 active:bg-muted ${
                    index > 0 ? 'border-t border-border' : ''
                  }`}
                  key={option.value}
                  onPress={() => choose(option.value)}
                >
                  <Text className={`text-sm ${active ? 'text-primary' : 'text-surface-foreground'}`}>
                    {option.label}
                  </Text>
                  {active ? <Icon className="text-primary" icon={IconCheck} size={16} /> : null}
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}
    </FieldShell>
  );
}
