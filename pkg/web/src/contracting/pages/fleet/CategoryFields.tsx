import { categoryColours, categoryIcons } from '@pkg/domain/contracting';
import type { Category, CategoryColour, CategoryIconKey, CategoryKind } from '@pkg/schema/contracting';
import type React from 'react';
import { useState } from 'react';
import { useFieldContext } from '@/components/form/index.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { buttonVariants } from '@/components/ui/button.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { CategoryIcon, CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { cn } from '@/lib/utils.js';

export const categoryKindLabels: Record<CategoryKind, string> = { machine: 'Machine', implement: 'Implement' };
export const categoryKindOptions = (Object.keys(categoryKindLabels) as CategoryKind[]).map((value) => ({
  value,
  label: categoryKindLabels[value],
}));

/** A category select option: its glyph beside its name. */
export function categoryOptions(categories: readonly Category[]) {
  return categories.map((category) => ({
    value: category.id,
    label: <CategoryLabel icon={category.icon} colour={category.colour} name={category.name} size={16} />,
  }));
}
export function CategoryKindFilter({
  value,
  onChange,
}: {
  value: CategoryKind | 'all';
  onChange: (value: CategoryKind | 'all') => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(value) => {
        if (value === 'machine' || value === 'implement' || value === 'all') onChange(value);
      }}
    >
      <SelectTrigger aria-label="Category kind">
        <SelectValue>{value === 'all' ? 'All kinds' : `${categoryKindLabels[value]} categories`}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All kinds</SelectItem>
        <SelectItem value="machine">Machine categories</SelectItem>
        <SelectItem value="implement">Implement categories</SelectItem>
      </SelectContent>
    </Select>
  );
}
/** A popover of labelled tiles bound to the field; the trigger previews the current choice. */
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
          className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-start gap-2 font-normal')}
        >
          {selected?.tile}
          {selected?.label}
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
