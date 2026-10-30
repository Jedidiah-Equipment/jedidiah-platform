import { formatDate } from '@pkg/domain';
import { READ_AT_NOW, readAtInputValue, readAtOf, readAtPickedFromPicker } from '@pkg/domain/contracting';
import { type ChangeEvent, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import { DateFieldTrigger } from '@/components/form/fields/DateFieldTrigger';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Text } from '@/components/ui/text';
import {
  chooseReadAt,
  READ_AT_CHOICES,
  type ReadAtFieldHandle,
  type ReadAtFieldProps,
} from '@/contracting/components/read-at-field-shared';

export type { ReadAtFieldHandle, ReadAtFieldProps };

/** The date-time picker package has no web build; the browser's own `datetime-local` input stands in. */
export function ReadAtField({ choice, onChange, disabled = false, hint = null, ref }: ReadAtFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const at = readAtOf(choice);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };
  useImperativeHandle(ref, () => ({ open: () => chooseReadAt('earlier', onChange, openPicker) }));

  return (
    <View className="gap-2">
      <SegmentedControl
        disabled={disabled}
        onChange={(next) => chooseReadAt(next, onChange, openPicker)}
        options={READ_AT_CHOICES}
        value={choice.kind}
      />
      {choice.kind === 'earlier' ? (
        <DateFieldTrigger
          disabled={disabled}
          hasErrors={false}
          label="Read At"
          onClear={() => onChange(() => READ_AT_NOW)}
          onOpen={openPicker}
          placeholder="Pick when the meter was read"
          value={at ? formatDate(at, 'medium') : ''}
        />
      ) : null}
      {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
      <input
        aria-hidden
        disabled={disabled}
        max={readAtInputValue(new Date())}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const { value } = event.currentTarget;
          onChange((current) => readAtPickedFromPicker(current, value));
        }}
        ref={inputRef}
        style={{ height: 1, left: -1000, opacity: 0, pointerEvents: 'none', position: 'fixed', top: -1000, width: 1 }}
        tabIndex={-1}
        type="datetime-local"
        value={readAtInputValue(at ?? new Date())}
      />
    </View>
  );
}
