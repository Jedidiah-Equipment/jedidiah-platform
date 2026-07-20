import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { IconCalendar, IconX } from '@tabler/icons-react-native';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

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
  const [open, setOpen] = useState(false);

  const change = (event: DateTimePickerEvent, date?: Date) => {
    setOpen(false);
    if (event.type !== 'set' || !date) return;

    field.handleChange(toDateOnly(date));
    onValueCommit?.();
  };

  return (
    <FieldShell errors={errors} label={label}>
      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled, expanded: open }}
          className={`h-12 min-w-0 flex-1 flex-row items-center justify-between rounded-xl border bg-surface px-3 ${
            errors.length > 0 ? 'border-danger' : 'border-border'
          } ${disabled ? 'opacity-55' : 'active:bg-muted'}`}
          disabled={disabled}
          onPress={() => setOpen(true)}
        >
          <Text className={`text-sm ${field.state.value ? 'text-surface-foreground' : 'text-muted-foreground'}`}>
            {field.state.value || placeholder}
          </Text>
          <Icon className="text-muted-foreground" icon={IconCalendar} size={17} />
        </Pressable>
        {field.state.value && !disabled ? (
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
      {open ? (
        <DateTimePicker
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          mode="date"
          onChange={change}
          value={fromDateOnly(field.state.value)}
        />
      ) : null}
    </FieldShell>
  );
}

function fromDateOnly(value: string): Date {
  const date = value ? new Date(`${value.slice(0, 10)}T12:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
