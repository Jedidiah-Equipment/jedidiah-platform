import { formatNumber } from '@pkg/domain';
import * as React from 'react';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

const INTL_MAX_FRACTION_DIGITS = 100;

type NumberFieldInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'aria-invalid' | 'id' | 'name' | 'onBlur' | 'onChange' | 'type' | 'value'
>;

export type NumberFieldProps = {
  decimals?: number;
  description?: React.ReactNode;
  emptyValue?: number;
  fieldClassName?: string;
  label: React.ReactNode;
  orientation?: React.ComponentProps<typeof Field>['orientation'];
} & NumberFieldInputProps;

export function NumberField({
  decimals,
  description,
  emptyValue = NaN,
  fieldClassName,
  inputMode = 'decimal',
  label,
  orientation,
  ...inputProps
}: NumberFieldProps) {
  const field = useFieldContext<number>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  const [displayValue, setDisplayValue] = React.useState(() => formatNumberFieldValue(field.state.value, decimals));
  const previousFieldValue = React.useRef(field.state.value);

  React.useEffect(() => {
    if (!hasNumberFieldValueChanged(previousFieldValue.current, field.state.value)) return;

    previousFieldValue.current = field.state.value;
    setDisplayValue(formatNumberFieldValue(field.state.value, decimals));
  }, [decimals, field.state.value]);

  return (
    <Field
      data-disabled={inputProps.disabled}
      data-invalid={isInvalid}
      orientation={orientation}
      className={fieldClassName}
    >
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        aria-invalid={isInvalid}
        id={field.name}
        inputMode={inputMode}
        name={field.name}
        onBlur={() => {
          field.handleBlur();
          setDisplayValue(formatNumberFieldValue(field.state.value, decimals));
        }}
        onChange={(event) => {
          const nextValue = parseNumberFieldValue(event.target.value, emptyValue);
          setDisplayValue(event.target.value);
          previousFieldValue.current = nextValue;
          field.handleChange(nextValue);
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

export function formatNumberFieldValue(value: number, decimals?: number): string {
  if (!Number.isFinite(value)) return '';

  const displayValue = decimals === undefined && !Number.isInteger(value) ? Number(value.toPrecision(15)) : value;
  return formatNumber(displayValue, { decimals: decimals ?? decimalPlaces(displayValue) });
}

function decimalPlaces(value: number): number {
  const [coefficient = '', exponentText = '0'] = String(value).toLowerCase().split('e');
  const fractionLength = coefficient.split('.')[1]?.length ?? 0;

  // Intl.NumberFormat refuses more than 100 fraction digits, and a keyed `1e-101` asks for 101.
  return Math.min(INTL_MAX_FRACTION_DIGITS, Math.max(0, fractionLength - Number(exponentText)));
}

export function parseNumberFieldValue(text: string, emptyValue = NaN): number {
  if (text.trim() === '') return emptyValue;

  const normalizedText = normalizeNumberFieldText(text);
  return normalizedText === '' ? emptyValue : Number(normalizedText);
}

function normalizeNumberFieldText(text: string): string {
  const compactText = text.replace(/[\s\u00a0]/g, '').trim();
  if (compactText === '') return '';

  if (!compactText.includes('.')) {
    const lastCommaIndex = compactText.lastIndexOf(',');
    const commaTailLength = lastCommaIndex === -1 ? 0 : compactText.length - lastCommaIndex - 1;
    if (commaTailLength > 0 && commaTailLength <= 2) {
      return `${compactText.slice(0, lastCommaIndex).replaceAll(',', '')}.${compactText.slice(lastCommaIndex + 1)}`;
    }
  }

  return compactText.replaceAll(',', '');
}
