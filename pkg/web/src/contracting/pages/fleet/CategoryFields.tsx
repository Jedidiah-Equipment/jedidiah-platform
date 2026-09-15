import { categoryColours, categoryIcons, defaultCategoryIcon } from '@pkg/domain/contracting';
import { type Category, type CategoryColour, type CategoryIconKey, CategoryKind } from '@pkg/schema/contracting';
import { IconCategory } from '@tabler/icons-react';
import type React from 'react';
import { useState } from 'react';
import { useFieldContext } from '@/components/form/index.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { buttonVariants } from '@/components/ui/button.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { cn } from '@/lib/utils.js';

export const categoryKindLabels: Record<CategoryKind, string> = { machine: 'Machine', implement: 'Implement' };
export const categoryKindOptions = CategoryKind.options.map((value) => ({ value, label: categoryKindLabels[value] }));

export type CategoryKindFilterValue = CategoryKind | 'all';
export const categoryKindFilterOptions: readonly CategoryKindFilterValue[] = ['all', ...CategoryKind.options];
export const categoryKindFilterLabels: Record<CategoryKindFilterValue, string> = {
  all: 'All kinds',
  machine: 'Machine categories',
  implement: 'Implement categories',
};

/** A generic glyph follows the kind; a chosen one stays. */
export function iconAfterKindChange(kind: CategoryKind, icon: CategoryIconKey): CategoryIconKey {
  return icon === 'generic-machine' || icon === 'generic-implement' ? defaultCategoryIcon(kind) : icon;
}

/** A popover of labelled tiles bound to the field, opened by the current icon. */
function TilePickerField<T extends string>({
  label,
  disabled,
  options,
  onValueCommit,
}: {
  label: string;
  disabled: boolean;
  options: readonly { value: T; label: string; tile: React.ReactNode }[];
  onValueCommit?: ((value: T) => void) | undefined;
}) {
  const field = useFieldContext<T>();
  const [open, setOpen] = useState(false);
  const errors = getFieldErrors(field.state.meta.errors);
  const selected = options.find((option) => option.value === field.state.value);
  return (
    <Field data-disabled={disabled} data-invalid={errors.length > 0}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={field.name}
          disabled={disabled}
          aria-label={`${label}: ${selected?.label ?? 'Choose'}`}
          title={selected?.label}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon' }),
            'size-8! self-start rounded-full border-0 p-0 [&>span]:size-full!',
          )}
        >
          {selected?.tile ?? <IconCategory />}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <div role="listbox" aria-label={label} className="grid grid-cols-4 gap-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === field.state.value}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md border p-2 text-xs hover:bg-muted',
                  option.value === field.state.value ? 'border-primary bg-muted' : 'border-transparent',
                )}
                onClick={() => {
                  field.handleChange(option.value);
                  onValueCommit?.(option.value);
                  setOpen(false);
                }}
              >
                {option.tile}
                <span className="text-center leading-tight">{option.label}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <FieldError errors={errors} />
    </Field>
  );
}
export function CategoryPickerField({
  categories,
  disabled = false,
  onValueCommit,
}: {
  categories: readonly Category[];
  disabled?: boolean;
  onValueCommit?: (value: Category['id']) => void;
}) {
  return (
    <TilePickerField
      label="Category"
      disabled={disabled || categories.length === 0}
      onValueCommit={onValueCommit}
      options={categories.map((category) => ({
        value: category.id,
        label: category.name,
        tile: <CategoryIcon icon={category.icon} colour={category.colour} size={20} />,
      }))}
    />
  );
}
/** Every glyph, labelled, in the domain's picker order; previewed in the category's colour. */
export function CategoryIconField({
  colour,
  disabled = false,
  onValueCommit,
}: {
  colour: CategoryColour;
  disabled?: boolean;
  onValueCommit?: (value: CategoryIconKey) => void;
}) {
  return (
    <TilePickerField
      label="Icon"
      disabled={disabled}
      onValueCommit={onValueCommit}
      options={categoryIcons.map((glyph) => ({
        value: glyph.key,
        label: glyph.label,
        tile: <CategoryIcon icon={glyph.key} colour={colour} size={20} />,
      }))}
    />
  );
}
/** The eight palette tokens, each previewed with the category's glyph. */
export function CategoryColourField({
  icon,
  disabled = false,
  onValueCommit,
}: {
  icon: CategoryIconKey;
  disabled?: boolean;
  onValueCommit?: (value: CategoryColour) => void;
}) {
  return (
    <TilePickerField
      label="Colour"
      disabled={disabled}
      onValueCommit={onValueCommit}
      options={categoryColours.map((colour) => ({
        value: colour,
        label: colour.charAt(0).toUpperCase() + colour.slice(1),
        tile: <CategoryIcon icon={icon} colour={colour} size={20} />,
      }))}
    />
  );
}
