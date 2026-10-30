import { formatDate } from '@pkg/domain';
import { READ_AT_NOW, readAtOf, readAtPicked } from '@pkg/domain/contracting';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useImperativeHandle, useState } from 'react';
import { Platform, View } from 'react-native';
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

/** When the meter was read: Now, or Earlier… with a time; Android picks the date then the time, iOS both at once. */
export function ReadAtField({ choice, onChange, disabled = false, hint = null, ref }: ReadAtFieldProps) {
  const [open, setOpen] = useState(false);
  const at = readAtOf(choice);
  const shown = at ?? new Date();
  const pick = (picked: Date) => onChange((current) => readAtPicked(current, picked));

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
            pick(new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes()));
          },
        });
      },
    });
  };
  useImperativeHandle(ref, () => ({ open: () => chooseReadAt('earlier', onChange, openPicker) }));
  const now = () => {
    setOpen(false);
    onChange(() => READ_AT_NOW);
  };

  return (
    <View className="gap-2">
      <SegmentedControl
        disabled={disabled}
        onChange={(next) => (next === 'now' ? now() : chooseReadAt(next, onChange, openPicker))}
        options={READ_AT_CHOICES}
        value={choice.kind}
      />
      {choice.kind === 'earlier' ? (
        <DateFieldTrigger
          disabled={disabled}
          expanded={open}
          hasErrors={false}
          label="Read At"
          onClear={now}
          onOpen={() => (Platform.OS === 'android' ? openPicker() : setOpen((current) => !current))}
          placeholder="Pick when the meter was read"
          value={at ? formatDate(at, 'medium') : ''}
        />
      ) : null}
      {open && choice.kind === 'earlier' && Platform.OS === 'ios' ? (
        <DateTimePicker
          display="inline"
          maximumDate={new Date()}
          mode="datetime"
          onChange={(event, date) => {
            if (event.type === 'set' && date) pick(date);
          }}
          value={shown}
        />
      ) : null}
      {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
    </View>
  );
}
