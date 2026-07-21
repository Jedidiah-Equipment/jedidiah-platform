import { IconCheck, IconChevronDown, IconSearch, type Icon as TablerIcon } from '@tabler/icons-react-native';
import { forwardRef, type ReactNode, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

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
  value,
}: {
  accessibilityLabel: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View className="h-10 min-w-0 flex-1 flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3">
      <Icon className="text-muted-foreground" icon={IconSearch} size={17} />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 py-0"
        onChangeText={onChangeText}
        placeholder={placeholder}
        returnKeyType="search"
        textSize="toolbar"
        value={value}
      />
    </View>
  );
}

export function ListDropdownControl<Value extends string>({
  accessibilityLabel,
  active,
  dismissLabel,
  icon,
  menuWidth = 220,
  onChange,
  options,
  showLabel = false,
  value,
}: {
  accessibilityLabel: string;
  active: boolean;
  dismissLabel: string;
  icon: TablerIcon;
  menuWidth?: number;
  onChange: (value: Value) => void;
  options: readonly ListControlOption<Value>[];
  showLabel?: boolean;
  value: Value;
}) {
  const buttonRef = useRef<View>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ left: number; top: number } | null>(null);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  const openMenu = () => {
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ left: Math.max(8, x + width - menuWidth), top: y + height + 8 });
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
          style={{ left: menuAnchor.left, top: menuAnchor.top, width: menuWidth }}
        >
          <View className="p-1.5">
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
          </View>
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
