import * as React from 'react';

import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group.js';
import { getFieldErrors } from './field-errors.js';
import { useFieldContext } from './form-context.js';

type CurrencyFieldInputProps = Omit<
  React.ComponentProps<typeof InputGroupInput>,
  'aria-invalid' | 'id' | 'inputMode' | 'name' | 'onBlur' | 'onChange' | 'type' | 'value'
>;

export type CurrencyFieldProps = {
  currencyCode?: string;
  label: React.ReactNode;
  locale?: string;
} & CurrencyFieldInputProps;

export function CurrencyField({ currencyCode = 'ZAR', label, locale = 'en-ZA', ...inputProps }: CurrencyFieldProps) {
  const field = useFieldContext<number>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  const [displayValue, setDisplayValue] = React.useState(() => formatCurrencyValue(field.state.value, locale));

  // Sync display when the field value changes externally (e.g. form reset)
  const [prevFieldValue, setPrevFieldValue] = React.useState(field.state.value);
  if (prevFieldValue !== field.state.value) {
    setPrevFieldValue(field.state.value);
    setDisplayValue(formatCurrencyValue(field.state.value, locale));
  }

  return (
    <Field data-disabled={inputProps.disabled} data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          aria-invalid={isInvalid}
          id={field.name}
          inputMode="decimal"
          name={field.name}
          onBlur={() => {
            field.handleBlur();
            setDisplayValue(formatCurrencyValue(field.state.value, locale));
          }}
          onChange={(event) => {
            const text = event.target.value;
            setDisplayValue(text);
            field.handleChange(text.trim() === '' ? NaN : parseFloat(text));
          }}
          type="text"
          value={displayValue}
          {...inputProps}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>{currencyCode}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <FieldError errors={fieldErrors} />
    </Field>
  );
}

function formatCurrencyValue(value: number, locale: string): string {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
}
