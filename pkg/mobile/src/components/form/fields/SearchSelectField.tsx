import { IconCheck, IconChevronDown, IconPlus, IconX } from '@tabler/icons-react-native';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { PickerDropdown } from '@/components/ui/picker-dropdown';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useFieldContext } from '../hooks/form-context';
import { type FormFieldError, getFieldErrors } from '../utils/field-errors';
import { fieldStateClassNames } from '../utils/field-style';
import {
  type SearchSelectCreate,
  type SearchSelectFieldOption,
  type SearchSelectRow,
  searchSelectRows,
} from '../utils/search-select-rows';
import { FieldShell } from './FieldShell';

export type { SearchSelectCreate, SearchSelectFieldOption, SearchSelectRow };

export type SearchSelectProps = {
  create?: SearchSelectCreate | undefined;
  disabled?: boolean;
  emptyMessage?: string;
  errors?: FormFieldError[];
  label?: ReactNode;
  /** Called with a newly picked value; picking the current one again only closes the list. */
  onChange: (value: string) => void;
  options: readonly SearchSelectFieldOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  value: string;
};

export type SearchSelectFieldProps = Omit<SearchSelectProps, 'errors' | 'onChange' | 'value'> & {
  onValueCommit?: () => void;
};

/**
 * One choice from an in-memory list: collapsed to the current option, it opens into a search box over
 * a capped, scrolling list and closes again as soon as a row is picked.
 */
export function SearchSelect({
  create,
  disabled = false,
  emptyMessage = 'No matches.',
  errors = [],
  label,
  onChange,
  options,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search…',
  value,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const selected = options.find((option) => option.value === value);

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  const choose = (option: SearchSelectFieldOption) => {
    close();
    if (option.value !== value) onChange(option.value);
  };

  const createNamed = async (name: string) => {
    if (!create) return;
    setCreating(true);
    const id = await create.onCreate(name).finally(() => setCreating(false));
    if (id === undefined) return;
    close();
    onChange(id);
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

      <PickerDropdown<SearchSelectRow>
        emptyMessage={emptyMessage}
        isDisabled={(row) => row.kind === 'option' && row.option.disabled === true}
        keyOf={(row) => (row.kind === 'option' ? `option:${row.option.value}` : 'create')}
        onSelect={(row) => (row.kind === 'option' ? choose(row.option) : void createNamed(row.name))}
        open={open}
        pending={creating}
        renderRow={(row) => {
          if (row.kind === 'create')
            return (
              <>
                <Icon className="text-primary" icon={IconPlus} size={16} />
                <Text className="min-w-0 flex-1 text-sm text-primary" numberOfLines={1} weight="semibold">
                  Create "{row.name}"
                </Text>
              </>
            );
          const active = row.option.value === value;
          return (
            <>
              <OptionContent active={active} option={row.option} />
              {active ? <Icon className="text-primary" icon={IconCheck} size={16} /> : null}
            </>
          );
        }}
        rows={searchSelectRows(options, search, create)}
        selectedKey={`option:${value}`}
      />
    </FieldShell>
  );
}

/** The form-registry field: `SearchSelect` bound to the field's value and errors. */
export function SearchSelectField({ onValueCommit, ...props }: SearchSelectFieldProps) {
  const field = useFieldContext<string>();
  return (
    <SearchSelect
      {...props}
      errors={getFieldErrors(field.state.meta.errors)}
      value={field.state.value}
      onChange={(value) => {
        field.handleChange(value);
        onValueCommit?.();
      }}
    />
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
