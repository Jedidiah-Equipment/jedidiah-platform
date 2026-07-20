import { IconCalendar, IconX } from '@tabler/icons-react-native';
import type { ChangeEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { FieldShell } from './FieldShell';

export type DateFieldProps = {
  disabled?: boolean;
  label: ReactNode;
  onValueCommit?: () => void;
  placeholder?: string;
};

export function DateField({ disabled = false, label, onValueCommit, placeholder = 'Select date' }: DateFieldProps) {
  const field = useFieldContext<string>();
  const errors = getFieldErrors(field.state.meta.errors);
  const inputRef = useRef<HTMLInputElement>(null);
  const value = field.state.value.slice(0, 10);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;

    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };

  return (
    <FieldShell errors={errors} label={label}>
      <View className="flex-row gap-2">
        <Pressable
          accessibilityLabel={String(label)}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          className={`h-12 min-w-0 flex-1 flex-row items-center justify-between rounded-xl border bg-surface px-3 ${
            errors.length > 0 ? 'border-danger' : 'border-border'
          } ${disabled ? 'opacity-55' : 'active:bg-muted'}`}
          disabled={disabled}
          onPress={openPicker}
        >
          <Text className={`text-sm ${value ? 'text-surface-foreground' : 'text-muted-foreground'}`}>
            {value || placeholder}
          </Text>
          <Icon className="text-muted-foreground" icon={IconCalendar} size={17} />
        </Pressable>
        {value && !disabled ? (
          <Pressable
            accessibilityLabel={`Clear ${String(label)}`}
            accessibilityRole="button"
            className="h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
            onPress={() => {
              field.handleChange('');
              onValueCommit?.();
            }}
          >
            <Icon className="text-muted-foreground" icon={IconX} size={17} />
          </Pressable>
        ) : null}
      </View>
      <input
        aria-hidden
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          field.handleChange(event.currentTarget.value);
          onValueCommit?.();
        }}
        ref={inputRef}
        style={{ height: 1, left: -1000, opacity: 0, pointerEvents: 'none', position: 'fixed', top: -1000, width: 1 }}
        tabIndex={-1}
        type="date"
        value={value}
      />
    </FieldShell>
  );
}
