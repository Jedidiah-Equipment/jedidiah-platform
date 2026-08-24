import { formatNumber } from '@pkg/domain';
import * as React from 'react';

import { Field, FieldDescription, FieldError } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';
import { type FieldHelp, FieldLabelRow } from './FieldLabelRow.js';

const INTL_MAX_FRACTION_DIGITS = 100;

type NumberFieldInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'aria-invalid' | 'id' | 'name' | 'onBlur' | 'onChange' | 'type' | 'value'
>;

export type NumberFieldProps = {
  /** How many decimals the field shows and keeps. Undefined leaves the keyed value at full precision. */
  decimals?: number | undefined;
  description?: React.ReactNode;
  emptyValue?: number;
  fieldClassName?: string;
  help?: FieldHelp;
  label: React.ReactNode;
  orientation?: React.ComponentProps<typeof Field>['orientation'];
} & NumberFieldInputProps;

export function NumberField({
  decimals,
  description,
  emptyValue = NaN,
  fieldClassName,
  help,
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
  const previousDecimals = React.useRef(decimals);

  const commitValue = (nextValue: number) => {
    previousFieldValue.current = nextValue;
    field.handleChange(nextValue);
  };

  // Resyncs when the value changes outside the field (a form reset) and when the caller settles on a
  // precision — a row whose Part is still loading declares none, then declares what that Part counts
  // in. The settled precision rounds the value as well, or the display would go back to reading a
  // number the form does not hold.
  React.useEffect(() => {
    const hasValueChanged = hasNumberFieldValueChanged(previousFieldValue.current, field.state.value);
    if (!hasValueChanged && previousDecimals.current === decimals) return;

    const nextValue = roundNumberFieldValue(field.state.value, decimals);
    previousDecimals.current = decimals;
    previousFieldValue.current = nextValue;
    if (hasNumberFieldValueChanged(field.state.value, nextValue)) field.handleChange(nextValue);
    setDisplayValue(formatNumberFieldValue(nextValue, decimals));
    // The guard above makes a re-run on an unstable `handleChange` identity a no-op.
  }, [decimals, field.handleChange, field.state.value]);

  return (
    <Field
      data-disabled={inputProps.disabled}
      data-invalid={isInvalid}
      orientation={orientation}
      className={fieldClassName}
    >
      <FieldLabelRow help={help} htmlFor={field.name}>
        {label}
      </FieldLabelRow>
      <Input
        aria-invalid={isInvalid}
        id={field.name}
        inputMode={inputMode}
        name={field.name}
        onBlur={() => {
          const roundedValue = roundNumberFieldValue(field.state.value, decimals);
          if (hasNumberFieldValueChanged(field.state.value, roundedValue)) commitValue(roundedValue);
          field.handleBlur();
          setDisplayValue(formatNumberFieldValue(roundedValue, decimals));
        }}
        onChange={(event) => {
          setDisplayValue(event.target.value);
          commitValue(parseNumberFieldValue(event.target.value, emptyValue));
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

/**
 * The value the field is showing, read back off its own display text. A field that declares `decimals`
 * rounds what it shows, so the value has to follow it down — left alone the two disagree, and a save
 * is refused over a number nobody can see or correct. Going through the formatter is what keeps them
 * in step: Intl rounds half away from zero over the exact decimal value, which `Math.round` matches
 * for neither a negative half nor a value like `1.005`.
 */
export function roundNumberFieldValue(value: number, decimals?: number): number {
  if (decimals === undefined || !Number.isFinite(value)) return value;

  return parseNumberFieldValue(formatNumberFieldValue(value, decimals), value);
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
