import { categoryColourClassNames, categoryColours, categoryIcon, categoryIcons } from '@pkg/domain/contracting';
import type { Category, CategoryColour, CategoryIconKey, CategoryKind } from '@pkg/schema/contracting';
import { useState } from 'react';
import { useFieldContext } from '@/components/form/index.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { buttonVariants } from '@/components/ui/button.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { cn } from '@/lib/utils.js';

export const categoryKindLabels: Record<CategoryKind, string> = { machine: 'Machine', implement: 'Implement' };
export const categoryKindOptions = (Object.keys(categoryKindLabels) as CategoryKind[]).map((value) => ({
  value,
  label: categoryKindLabels[value],
}));
const colourLabel = (colour: CategoryColour) => colour.charAt(0).toUpperCase() + colour.slice(1);

/** A category select option: its glyph beside its name. */
export function categoryOptions(categories: readonly Category[]) {
  return categories.map((category) => ({
    value: category.id,
    label: (
      <span className="flex items-center gap-2">
        <CategoryIcon icon={category.icon} colour={category.colour} size={16} />
        {category.name}
      </span>
    ),
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
function PickerField({
  label,
  disabled,
  name,
  errors,
  trigger,
  children,
  open,
  onOpenChange,
}: {
  label: string;
  disabled: boolean;
  name: string;
  errors: ReturnType<typeof getFieldErrors>;
  trigger: React.ReactNode;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Field data-disabled={disabled} data-invalid={errors.length > 0}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          id={name}
          disabled={disabled}
          className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-start gap-2 font-normal')}
        >
          {trigger}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          {children}
        </PopoverContent>
      </Popover>
      <FieldError errors={errors} />
    </Field>
  );
}
const tileClassName = (selected: boolean) =>
  cn(
    'flex flex-col items-center gap-1 rounded-md border p-2 text-xs hover:bg-muted',
    selected ? 'border-primary bg-muted' : 'border-transparent',
  );
/** Every glyph, labelled, in the domain's picker order; previewed in the category's colour. */
export function CategoryIconField({
  label = 'Icon',
  colour,
  disabled = false,
  onValueCommit,
}: {
  label?: string;
  colour: CategoryColour;
  disabled?: boolean;
  onValueCommit?: (value: CategoryIconKey) => void;
}) {
  const field = useFieldContext<CategoryIconKey>();
  const [open, setOpen] = useState(false);
  const errors = getFieldErrors(field.state.meta.errors);
  return (
    <PickerField
      label={label}
      name={field.name}
      disabled={disabled}
      errors={errors}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <>
          <CategoryIcon icon={field.state.value} colour={colour} size={16} />
          {categoryIcon(field.state.value).label}
        </>
      }
    >
      <div role="listbox" aria-label={label} className="grid grid-cols-4 gap-1">
        {categoryIcons.map((glyph) => (
          <button
            key={glyph.key}
            type="button"
            role="option"
            aria-selected={glyph.key === field.state.value}
            className={tileClassName(glyph.key === field.state.value)}
            onClick={() => {
              field.handleChange(glyph.key);
              onValueCommit?.(glyph.key);
              setOpen(false);
            }}
          >
            <CategoryIcon icon={glyph.key} colour={colour} size={20} />
            <span className="text-center leading-tight">{glyph.label}</span>
          </button>
        ))}
      </div>
    </PickerField>
  );
}
/** The eight palette tokens as swatches; previewed with the category's glyph. */
export function CategoryColourField({
  label = 'Colour',
  icon,
  disabled = false,
  onValueCommit,
}: {
  label?: string;
  icon: CategoryIconKey;
  disabled?: boolean;
  onValueCommit?: (value: CategoryColour) => void;
}) {
  const field = useFieldContext<CategoryColour>();
  const [open, setOpen] = useState(false);
  const errors = getFieldErrors(field.state.meta.errors);
  return (
    <PickerField
      label={label}
      name={field.name}
      disabled={disabled}
      errors={errors}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <>
          <CategoryIcon icon={icon} colour={field.state.value} size={16} />
          {colourLabel(field.state.value)}
        </>
      }
    >
      <div role="listbox" aria-label={label} className="grid grid-cols-4 gap-1">
        {categoryColours.map((colour) => (
          <button
            key={colour}
            type="button"
            role="option"
            aria-selected={colour === field.state.value}
            className={tileClassName(colour === field.state.value)}
            onClick={() => {
              field.handleChange(colour);
              onValueCommit?.(colour);
              setOpen(false);
            }}
          >
            <span className={cn('size-5 rounded-full', categoryColourClassNames[colour].dot)} />
            <span>{colourLabel(colour)}</span>
          </button>
        ))}
      </div>
    </PickerField>
  );
}
