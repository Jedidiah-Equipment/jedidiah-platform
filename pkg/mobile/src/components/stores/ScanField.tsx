import { IconCamera, IconScan } from '@tabler/icons-react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, type TextInput as RNTextInput, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';

import { ScanCameraModal } from './ScanCameraModal';

/**
 * The tablet's one input (spec §10).
 *
 * A Bluetooth HID scanner is a keyboard: it types the payload and presses Enter. So this is an
 * ordinary text field that holds focus and treats submit as "a scan happened" — no scanner SDK, no
 * device pairing code, nothing to go wrong when the scanner is swapped for a different model.
 *
 * It stays *visible* rather than hidden, which is a deliberate departure from the usual wedge
 * trick: the same field is the type-ahead fallback for a label too scuffed to read (spec §10), and
 * a warehouse needs to see what the scanner just put in it when a read goes wrong.
 *
 * "Always focused" is implemented as focus on arrival and focus after each scan — deliberately not
 * as reclaiming focus on every blur. A field that grabs focus back the instant it loses it eats the
 * first tap on whatever the person was reaching for, which on this screen is the name panel: they
 * tap their name, nothing happens, and they tap again. Losing focus because somebody deliberately
 * touched another control is not a fault to correct.
 */
export function ScanField({
  caption = 'SCAN, OR TYPE A PART CODE AND PRESS RETURN',
  isActive = true,
  onScan,
  placeholder = 'Scan a Part label or badge',
}: {
  /** What this field is for, in the caller's own words — a badge field is not asking for a code. */
  caption?: string;
  /**
   * False while a dialog this screen owns is covering the field. Reclaiming focus on the way back
   * to true is the point: a dialog carrying its own scan field takes focus and, being a Modal
   * rather than a route, never returns it through navigation — so the wedge would type into
   * nothing for the rest of the shift.
   */
  isActive?: boolean;
  onScan: (raw: string) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<RNTextInput>(null);
  const [value, setValue] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);

  // Focus on arrival, again whenever the screen is returned to, and again when a dialog that was
  // covering the field closes. `useFocusEffect` re-runs when its callback identity changes while the
  // screen is focused, so keying the callback on `isActive` covers the dialog case too — walking
  // back from a posting screen and dismissing the quick-switch both leave the wedge pointed here.
  useFocusEffect(
    useCallback(() => {
      if (isActive) inputRef.current?.focus();
    }, [isActive]),
  );

  const submit = useCallback(
    (raw: string) => {
      setValue('');
      onScan(raw);
      // The wedge fires the next scan straight away, so focus has to be back before it arrives.
      inputRef.current?.focus();
    },
    [onScan],
  );

  return (
    <View className="gap-2">
      {/*
        `items-stretch` rather than `items-center`: the field's height comes from the text it holds,
        and the camera button matches it instead of sizing itself from its icon. Padding the button
        to the same height by hand would only hold until the field's type size next moved.
      */}
      <View className="flex-row items-stretch gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3">
          <Icon className="text-muted-foreground" icon={IconScan} size={22} />
          <TextInput
            accessibilityLabel="Scan field"
            autoCapitalize="characters"
            autoCorrect={false}
            className="min-w-0 flex-1 border-0 bg-transparent px-0"
            onChangeText={setValue}
            onSubmitEditing={(event) => submit(event.nativeEvent.text)}
            placeholder={placeholder}
            ref={inputRef}
            returnKeyType="done"
            submitBehavior="submit"
            textSize="toolbar"
            value={value}
          />
        </View>
        <Pressable
          accessibilityLabel="Scan with the camera"
          accessibilityRole="button"
          // Horizontal padding only — a vertical one would set a minimum height and take the row
          // back off the field.
          className="shrink-0 justify-center rounded-xl border border-border bg-surface px-3"
          onPress={() => setCameraOpen(true)}
        >
          <Icon className="text-surface-foreground" icon={IconCamera} size={22} />
        </Pressable>
      </View>
      <Text className="text-[11px] text-muted-foreground" mono>
        {caption}
      </Text>

      <ScanCameraModal
        onClose={() => {
          setCameraOpen(false);
          inputRef.current?.focus();
        }}
        onScanned={(raw) => {
          setCameraOpen(false);
          submit(raw);
        }}
        open={cameraOpen}
      />
    </View>
  );
}
