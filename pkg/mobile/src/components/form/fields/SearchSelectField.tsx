import { IconCheck, IconChevronDown, IconX } from '@tabler/icons-react-native';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { PickerDropdown } from '@/components/ui/picker-dropdown';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { fieldStateClassNames } from '../utils/field-style';
import { FieldShell } from './FieldShell';

export type SearchSelectFieldOption = {
  /** Second line under the label; search matches it too. */
  description?: string;
  /** Shown but not pickable, such as a Machine already on another Job. */
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  value: string;
};

export type SearchSelectFieldProps = {
  disabled?: boolean;
  emptyMessage?: string;
  label?: ReactNode;
  onValueCommit?: () => void;
  options: readonly SearchSelectFieldOption[];
  placeholder?: string;
  searchPlaceholder?: string;
};

/**
 * One choice from an in-memory list: collapsed to the current option, it opens into a search box over
 * a capped, scrolling list and closes again as soon as a row is picked.
 */
export function SearchSelectField({
  disabled = false,
  emptyMessage = 'No matches.',
  label,
  onValueCommit,
  options,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search…',
}: SearchSelectFieldProps) {
  const field = useFieldContext<string>();
  const errors = getFieldErrors(field.state.meta.errors);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((option) => option.value === field.state.value);

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  const choose = (option: SearchSelectFieldOption) => {
    close();
    if (option.value === field.state.value) return;

    field.handleChange(option.value);
    onValueCommit?.();
  };

  return (
    <FieldShell errors={errors} label={label}>
      {open ? (
        <View className="flex-row items-center gap-2">
          <TextInput
            accessibilityLabel={typeof label === 'string' ? `Search ${label}` : 'Search'}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            className="h-12 min-w-0 flex-1"
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
            value={search}
          />
          <Pressable
            accessibilityLabel="Close list"
            accessibilityRole="button"
            className="h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
            onPress={close}
          >
            <Icon className="text-muted-foreground" icon={IconX} size={18} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled, expanded: false }}
          className={`h-12 flex-row items-center justify-between gap-3 rounded-xl border bg-surface px-3 ${fieldStateClassNames(
            { disabled, hasErrors: errors.length > 0 },
          )} ${disabled ? '' : 'active:bg-muted'}`}
          disabled={disabled}
          onPress={() => setOpen(true)}
        >
          {selected ? (
            <OptionContent option={selected} />
          ) : (
            <Text className="min-w-0 flex-1 text-sm text-muted-foreground" numberOfLines={1}>
              {placeholder}
            </Text>
          )}
          <Icon className="text-muted-foreground" icon={IconChevronDown} size={16} />
        </Pressable>
      )}

      <PickerDropdown
        emptyMessage={emptyMessage}
        isDisabled={(option) => option.disabled === true}
        keyOf={(option) => `option:${option.value}`}
        onSelect={choose}
        open={open}
        pending={false}
        renderRow={(option) => {
          const active = option.value === field.state.value;
          return (
            <>
              <OptionContent active={active} option={option} />
              {active ? <Icon className="text-primary" icon={IconCheck} size={16} /> : null}
            </>
          );
        }}
        rows={filterOptions(options, search)}
        selectedKey={`option:${field.state.value}`}
      />
    </FieldShell>
  );
}

function OptionContent({ active = false, option }: { active?: boolean; option: SearchSelectFieldOption }) {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-3">
      {option.icon}
      <View className="min-w-0 flex-1">
        <Text
          className={`text-sm ${active ? 'text-primary' : 'text-surface-foreground'}`}
          numberOfLines={1}
          weight={option.description ? 'semibold' : undefined}
        >
          {option.label}
        </Text>
        {option.description ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {option.description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function filterOptions(
  options: readonly SearchSelectFieldOption[],
  search: string,
): readonly SearchSelectFieldOption[] {
  const term = search.trim().toLowerCase();
  if (!term) return options;

  return options.filter((option) =>
    [option.label, option.description].some((text) => text?.toLowerCase().includes(term)),
  );
}
