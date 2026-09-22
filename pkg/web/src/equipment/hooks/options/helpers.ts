export type SelectOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

export function toSelectOptions<TItem extends { disabled?: boolean; id: string }>(
  items: readonly TItem[],
  getLabel: (item: TItem) => string,
): SelectOption[] {
  return items.map((item) => ({
    ...(item.disabled ? { disabled: true } : {}),
    label: getLabel(item),
    value: item.id,
  }));
}

export function stringsToSelectOptions(items: readonly string[]): SelectOption[] {
  return items.map((item) => ({
    label: item,
    value: item,
  }));
}

export function mergeSelectedOption<TOption extends { id: string }>(
  options: readonly TOption[],
  selected: TOption | null | undefined,
): TOption[] {
  if (!selected || options.some((option) => option.id === selected.id)) {
    return [...options];
  }

  return [...options, selected];
}
