import { formatDate } from '@pkg/domain';
import { readAtFromInput, readAtInputValue } from '@pkg/domain/contracting';
import { type ChangeEvent, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import { DateFieldTrigger } from '@/components/form/fields/DateFieldTrigger';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Text } from '@/components/ui/text';
import {
  READ_AT_CHOICES,
  type ReadAtFieldHandle,
  type ReadAtFieldProps,
} from '@/contracting/components/read-at-field-shared';

export type { ReadAtFieldHandle, ReadAtFieldProps };

/** The date-time picker package has no web build; the browser's own `datetime-local` input stands in. */
export function ReadAtField({ value, onChange, disabled = false, hint = null, ref }: ReadAtFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };
  useImperativeHandle(ref, () => ({ open: openPicker }));

  return (
    <View className="gap-2">
      <SegmentedControl
        disabled={disabled}
        onChange={(choice) => (choice === 'now' ? onChange(null) : openPicker())}
        options={READ_AT_CHOICES}
        value={value === null ? 'now' : 'earlier'}
      />
      {value !== null ? (
        <DateFieldTrigger
          disabled={disabled}
          hasErrors={false}
          label="Read At"
          onClear={() => onChange(null)}
          onOpen={openPicker}
          placeholder="Pick when the meter was read"
          value={formatDate(value, 'medium')}
        />
      ) : null}
      {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
      <input
        aria-hidden
        disabled={disabled}
        max={readAtInputValue(new Date())}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const picked = readAtFromInput(event.currentTarget.value);
          if (picked) onChange(picked);
        }}
        ref={inputRef}
        style={{ height: 1, left: -1000, opacity: 0, pointerEvents: 'none', position: 'fixed', top: -1000, width: 1 }}
        tabIndex={-1}
        type="datetime-local"
        value={readAtInputValue(value ?? new Date())}
      />
    </View>
  );
}
