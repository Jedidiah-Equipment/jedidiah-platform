import { formatDate } from '@pkg/domain';
import { readAtFromPicker, readAtInputValue } from '@pkg/domain/contracting';
import { type ChangeEvent, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import { DateFieldTrigger } from '@/components/form/fields/DateFieldTrigger';
import type { ReadAtFieldHandle, ReadAtFieldProps } from '@/contracting/components/read-at-field-shared';

export type { ReadAtFieldHandle, ReadAtFieldProps };

/** The date-time picker package has no web build; the browser's own `datetime-local` input stands in. */
export function ReadAtField({ value, onPick, disabled = false, ref }: ReadAtFieldProps) {
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
      <DateFieldTrigger
        disabled={disabled}
        hasErrors={false}
        label="Read At"
        onClear={() => onPick(null)}
        onOpen={openPicker}
        placeholder="Now"
        value={value ? formatDate(value, 'medium') : ''}
      />
      <input
        aria-hidden
        disabled={disabled}
        max={readAtInputValue(new Date())}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const picked = readAtFromPicker(event.currentTarget.value, value);
          if (picked) onPick(picked);
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
