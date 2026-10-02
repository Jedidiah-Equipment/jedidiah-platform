import { formatDate } from '@pkg/domain';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { DateFieldTrigger } from '@/components/form/fields/DateFieldTrigger';

export type ReadAtFieldProps = { value: Date | null; onChange: (value: Date | null) => void; disabled?: boolean };

/** When the meter was read: "Now" until set; Android picks the date then the time, iOS both at once. */
export function ReadAtField({ value, onChange, disabled = false }: ReadAtFieldProps) {
  const [open, setOpen] = useState(false);
  const shown = value ?? new Date();

  const openPicker = () => {
    if (Platform.OS !== 'android') {
      setOpen((current) => !current);
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

  return (
    <View className="gap-2">
      <DateFieldTrigger
        disabled={disabled}
        expanded={open}
        hasErrors={false}
        label="Read At"
        onClear={() => {
          setOpen(false);
          onChange(null);
        }}
        onOpen={openPicker}
        placeholder={`Now · ${formatDate(new Date(), 'medium')}`}
        value={value ? formatDate(value, 'medium') : ''}
      />
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
    </View>
  );
}
