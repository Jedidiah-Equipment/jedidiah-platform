import { formatDate } from '@pkg/domain';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useImperativeHandle, useState } from 'react';
import { Platform, View } from 'react-native';
import { DateFieldTrigger } from '@/components/form/fields/DateFieldTrigger';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Text } from '@/components/ui/text';
import {
  READ_AT_CHOICES,
  type ReadAtFieldHandle,
  type ReadAtFieldProps,
} from '@/contracting/components/read-at-field-shared';

export type { ReadAtFieldHandle, ReadAtFieldProps };

/** When the meter was read: Now, or Earlier… with a time; Android picks the date then the time, iOS both at once. */
export function ReadAtField({ value, onChange, disabled = false, hint = null, ref }: ReadAtFieldProps) {
  const [open, setOpen] = useState(false);
  const shown = value ?? new Date();

  const openPicker = () => {
    if (Platform.OS !== 'android') {
      // The inline picker shows a time from the start, so Save posts the time on screen.
      if (value === null) onChange(new Date());
      setOpen(true);
      return;
    }
    DateTimePickerAndroid.open({
      mode: 'date',
      value: shown,
      maximumDate: new Date(),
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          mode: 'time',
          is24Hour: true,
          value: date,
          onChange: (timeEvent, time) => {
            if (timeEvent.type !== 'set' || !time) return;
            onChange(new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes()));
          },
        });
      },
    });
  };
  useImperativeHandle(ref, () => ({ open: openPicker }));
  const now = () => {
    setOpen(false);
    onChange(null);
  };
  const earlier = value !== null || open;

  return (
    <View className="gap-2">
      <SegmentedControl
        disabled={disabled}
        onChange={(choice) => (choice === 'now' ? now() : openPicker())}
        options={READ_AT_CHOICES}
        value={earlier ? 'earlier' : 'now'}
      />
      {earlier ? (
        <DateFieldTrigger
          disabled={disabled}
          expanded={open}
          hasErrors={false}
          label="Read At"
          onClear={now}
          onOpen={() => (Platform.OS === 'android' ? openPicker() : setOpen((current) => !current))}
          placeholder="Pick when the meter was read"
          value={value ? formatDate(value, 'medium') : ''}
        />
      ) : null}
      {open && Platform.OS === 'ios' ? (
        <DateTimePicker
          display="inline"
          maximumDate={new Date()}
          mode="datetime"
          onChange={(event, date) => {
            if (event.type === 'set' && date) onChange(date);
          }}
          value={shown}
        />
      ) : null}
      {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
    </View>
  );
}
