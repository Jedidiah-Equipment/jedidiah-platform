import { formatDate } from '@pkg/domain';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useImperativeHandle, useState } from 'react';
import { Platform, View } from 'react-native';
import { DateFieldTrigger } from '@/components/form/fields/DateFieldTrigger';
import type { ReadAtFieldHandle, ReadAtFieldProps } from '@/contracting/components/read-at-field-shared';

export type { ReadAtFieldHandle, ReadAtFieldProps };

/** When the meter was read; Android picks the date then the time, iOS both at once. */
export function ReadAtField({ value, onPick, disabled = false, ref }: ReadAtFieldProps) {
  const [open, setOpen] = useState(false);
  const shown = value ?? new Date();

  const openPicker = () => {
    // The inline picker opens on a time, which is not a pick until the person chooses a day or a time in it.
    if (Platform.OS !== 'android') {
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
            onPick(new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes()));
          },
        });
      },
    });
  };
  useImperativeHandle(ref, () => ({ open: openPicker }));

  return (
    <View className="gap-2">
      <DateFieldTrigger
        disabled={disabled}
        expanded={open}
        hasErrors={false}
        label="Read At"
        onClear={() => {
          setOpen(false);
          onPick(null);
        }}
        onOpen={() => (Platform.OS === 'android' ? openPicker() : setOpen((current) => !current))}
        placeholder="Now"
        value={value ? formatDate(value, 'medium') : ''}
      />
      {open && Platform.OS === 'ios' ? (
        <DateTimePicker
          display="inline"
          maximumDate={new Date()}
          mode="datetime"
          onChange={(event, date) => {
            if (event.type === 'set' && date) onPick(date);
          }}
          value={shown}
        />
      ) : null}
    </View>
  );
}
