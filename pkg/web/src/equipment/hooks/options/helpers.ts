export type SelectOption = {
  label: string;
  value: string;
};

export function toSelectOptions<TItem extends { id: string }>(
  items: readonly TItem[],
  getLabel: (item: TItem) => string,
): SelectOption[] {
  return items.map((item) => ({
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
