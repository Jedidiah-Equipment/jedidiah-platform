import * as React from 'react';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { getFieldErrors } from './field-errors.js';
import { useFieldContext } from './form-context.js';

type NumberFieldInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'aria-invalid' | 'id' | 'name' | 'onBlur' | 'onChange' | 'type' | 'value'
>;

export type NumberFieldProps = {
  description?: React.ReactNode;
  emptyValue?: number;
  label: React.ReactNode;
} & NumberFieldInputProps;

export function NumberField({
  description,
  emptyValue = NaN,
  inputMode = 'decimal',
  label,
  ...inputProps
}: NumberFieldProps) {
  const field = useFieldContext<number>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  const [displayValue, setDisplayValue] = React.useState(() => formatNumberFieldValue(field.state.value));
  const previousFieldValue = React.useRef(field.state.value);

  React.useEffect(() => {
    if (!hasNumberFieldValueChanged(previousFieldValue.current, field.state.value)) return;

    previousFieldValue.current = field.state.value;
    setDisplayValue(formatNumberFieldValue(field.state.value));
  }, [field.state.value]);

  return (
    <Field data-disabled={inputProps.disabled} data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        aria-invalid={isInvalid}
        id={field.name}
        inputMode={inputMode}
        name={field.name}
        onBlur={() => {
          field.handleBlur();
          setDisplayValue(formatNumberFieldValue(field.state.value));
        }}
        onChange={(event) => {
          setDisplayValue(event.target.value);
          field.handleChange(parseNumberFieldValue(event.target.value, emptyValue));
        }}
        type="text"
        value={displayValue}
        {...inputProps}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={fieldErrors} />
    </Field>
  );
}

export function hasNumberFieldValueChanged(previousValue: number, nextValue: number): boolean {
  return !Object.is(previousValue, nextValue);
}

export function formatNumberFieldValue(value: number): string {
  return Number.isNaN(value) ? '' : String(value);
}

export function parseNumberFieldValue(text: string, emptyValue = NaN): number {
  if (text.trim() === '') return emptyValue;

  return Number(text);
}
