import { IconCheck, IconChevronDown, IconSearch, type Icon as TablerIcon } from '@tabler/icons-react-native';
import { forwardRef, type ReactNode, useRef, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';

export type ListControlOption<Value extends string> = {
  label: string;
  value: Value;
};

/** Fixed-height list controls stay on one row; their labels truncate as available width shrinks. */
export function ListControlRow({ leading, trailing }: { leading: ReactNode; trailing: ReactNode }) {
  return (
    <View className="z-10 h-10 flex-row items-center gap-2">
      <View className="min-w-0 flex-1">{leading}</View>
      <View className="min-w-0 shrink">{trailing}</View>
    </View>
  );
}

export function ListSearchControl({
  accessibilityLabel,
  onChangeText,
  placeholder,
  tone = 'surface',
  value,
}: {
  accessibilityLabel: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /** 'background' when the control sits on an already-surfaced card. */
  tone?: 'surface' | 'background';
  value: string;
}) {
  const [focused, setFocused] = useState(false);
  const showOverlay = !focused && value.length === 0;

  return (
    <View
      className={`h-10 min-w-0 flex-1 flex-row items-center gap-2 rounded-xl border border-border px-3 ${
        tone === 'background' ? 'bg-background' : 'bg-surface'
      }`}
    >
      <Icon className="text-muted-foreground" icon={IconSearch} size={17} />
      <View className="min-w-0 flex-1">
        <TextInput
          accessibilityLabel={accessibilityLabel}
          className="h-10 w-full border-0 bg-transparent"
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          returnKeyType="search"
          // Inline padding wins over the shared input's NativeWind padding on web, keeping
          // the native focused placeholder aligned with the unfocused overlay.
          style={{ paddingHorizontal: 0, paddingVertical: 0 }}
          textSize="toolbar"
          value={value}
          // Hidden behind the overlay, but still the field's accessibility hint.
          {...(showOverlay ? { placeholderTextColor: 'transparent' } : null)}
        />
        {/* A native placeholder clips mid-word; a Text ellipsises, so these can name what is
            searched. Only while blurred: focused, the native placeholder keeps the caret above it. */}
        {showOverlay ? (
          <View aria-hidden className="absolute inset-0 justify-center" pointerEvents="none">
            <Text className="text-toolbar text-muted-foreground" numberOfLines={1}>
              {placeholder}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function ListDropdownControl<Value extends string>({
  accessibilityLabel,
  defaultValue,
  dismissLabel,
  icon,
  menuWidth = 220,
  onChange,
  options,
  showLabel = false,
  value,
}: {
  accessibilityLabel: string;
  /** Non-default selections render in the active (primary) style. */
  defaultValue: Value;
  dismissLabel: string;
  icon: TablerIcon;
  menuWidth?: number;
  onChange: (value: Value) => void;
  options: readonly ListControlOption<Value>[];
  showLabel?: boolean;
  value: Value;
}) {
  const buttonRef = useRef<View>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menuAnchor, setMenuAnchor] = useState<{ right: number; top: number; bottom: number } | null>(null);
  const active = value !== defaultValue;
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;
  const width = Math.min(menuWidth, windowWidth - insets.left - insets.right - 16);
  const spaceBelow = Math.max(0, windowHeight - insets.bottom - (menuAnchor?.bottom ?? 0) - 8);
  const spaceAbove = Math.max(0, (menuAnchor?.top ?? 0) - insets.top - 8);
  const openBelow = spaceBelow >= spaceAbove;
  const maxHeight = openBelow ? spaceBelow : spaceAbove;

  const openMenu = () => {
    buttonRef.current?.measureInWindow((x, y, buttonWidth, height) => {
      setMenuAnchor({ right: x + buttonWidth, top: y - 8, bottom: y + height + 8 });
    });
  };

  return (
    <View className={showLabel ? 'max-w-full shrink' : ''}>
      <ListDropdownButton
        accessibilityLabel={`${accessibilityLabel}: ${selectedLabel}`}
        active={active}
        expanded={menuAnchor !== null}
        icon={icon}
        label={selectedLabel}
        onPress={openMenu}
        ref={buttonRef}
        showLabel={showLabel}
      />

      {menuAnchor ? (
        <AnchoredMenu
          dismissLabel={dismissLabel}
          onClose={() => setMenuAnchor(null)}
          style={{
            left: Math.max(insets.left + 8, Math.min(menuAnchor.right - width, windowWidth - insets.right - width - 8)),
            ...(openBelow ? { top: menuAnchor.bottom } : { bottom: windowHeight - menuAnchor.top }),
            width,
          }}
        >
          <ScrollView style={{ maxHeight }} contentContainerStyle={{ padding: 6 }} keyboardShouldPersistTaps="handled">
            {options.map((option) => (
              <ListDropdownOption
                key={option.value}
                label={option.label}
                onPress={() => {
                  onChange(option.value);
                  setMenuAnchor(null);
                }}
                selected={option.value === value}
              />
            ))}
          </ScrollView>
        </AnchoredMenu>
      ) : null}
    </View>
  );
}

const ListDropdownButton = forwardRef<
  View,
  {
    accessibilityLabel: string;
    active: boolean;
    expanded: boolean;
    icon: TablerIcon;
    label: string;
    onPress: () => void;
    showLabel: boolean;
  }
>(function ListDropdownButton({ accessibilityLabel, active, expanded, icon, label, onPress, showLabel }, ref) {
  const accentClassName = active ? 'text-primary' : 'text-muted-foreground';

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      className={`h-10 min-w-0 max-w-full flex-row items-center gap-2 rounded-xl border px-3 ${
        active ? 'border-primary bg-primary/10' : 'border-border bg-surface'
      }`}
      onPress={onPress}
      ref={ref}
    >
      <Icon className={accentClassName} icon={icon} size={15} />
      {showLabel ? (
        <>
          <Text
            className={`min-w-0 flex-1 text-toolbar tracking-wide ${accentClassName}`}
            numberOfLines={1}
            weight="semibold"
          >
            {label}
          </Text>
          <Icon className={accentClassName} icon={IconChevronDown} size={13} />
        </>
      ) : null}
    </Pressable>
  );
});

function ListDropdownOption({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="flex-row items-center justify-between gap-3 rounded-xl px-3 py-2.5 active:bg-muted"
      onPress={onPress}
    >
      <Text className={selected ? 'text-primary' : 'text-foreground'} numberOfLines={1} weight="semibold">
        {label}
      </Text>
      {selected ? <Icon className="text-primary" icon={IconCheck} size={15} /> : null}
    </Pressable>
  );
}
