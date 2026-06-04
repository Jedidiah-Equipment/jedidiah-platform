import * as React from 'react';

import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

// Country code is hardcoded to South Africa for now and shown in the right addon.
const COUNTRY_CODE = '+27';

type PhoneNumberFieldInputProps = Omit<
  React.ComponentProps<typeof InputGroupInput>,
  'aria-invalid' | 'autoComplete' | 'id' | 'inputMode' | 'name' | 'onBlur' | 'onChange' | 'type' | 'value'
>;

export type PhoneNumberFieldProps = {
  label: React.ReactNode;
} & PhoneNumberFieldInputProps;

export function PhoneNumberField({ label, ...inputProps }: PhoneNumberFieldProps) {
  const field = useFieldContext<string | null>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  const [displayValue, setDisplayValue] = React.useState(() => toNationalDigits(field.state.value));

  // Sync display when the field value changes externally (e.g. form reset).
  const previousFieldValue = React.useRef(field.state.value);
  React.useEffect(() => {
    if (Object.is(previousFieldValue.current, field.state.value)) return;

    previousFieldValue.current = field.state.value;
    setDisplayValue(toNationalDigits(field.state.value));
  }, [field.state.value]);

  return (
    <Field data-disabled={inputProps.disabled} data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          aria-invalid={isInvalid}
          autoComplete="tel-national"
          id={field.name}
          inputMode="tel"
          name={field.name}
          onBlur={() => field.handleBlur()}
          onChange={(event) => {
            const nationalDigits = normalizeNationalDigits(event.target.value);
            setDisplayValue(nationalDigits);
            field.handleChange(nationalDigits === '' ? null : `${COUNTRY_CODE}${nationalDigits}`);
          }}
          type="tel"
          value={displayValue}
          {...inputProps}
        />
        <InputGroupAddon align="inline-start">
          <InputGroupText>{COUNTRY_CODE}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <FieldError errors={fieldErrors} />
    </Field>
  );
}

// Strips a stored E.164 value (e.g. +27821234567) back to its national digits for display.
function toNationalDigits(value: string | null): string {
  if (!value) return '';
  return normalizeNationalDigits(value.startsWith(COUNTRY_CODE) ? value.slice(COUNTRY_CODE.length) : value);
}

// Keeps digits only and drops a single leading 0 (national-format prefix).
function normalizeNationalDigits(text: string): string {
  return text.replace(/\D/g, '').replace(/^0/, '');
}
