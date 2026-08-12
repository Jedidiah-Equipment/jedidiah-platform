import { CURRENCY_SYMBOL_BY_CODE, formatCurrency, formatNumber } from '@pkg/domain';
import * as React from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group.js';
import { useFieldContext } from '../hooks/form-context.js';
import { getFieldErrors } from '../utils/field-errors.js';

type CurrencyFieldInputProps = Omit<
  React.ComponentProps<typeof InputGroupInput>,
  'aria-invalid' | 'id' | 'inputMode' | 'name' | 'onBlur' | 'onChange' | 'type' | 'value'
>;

export type CurrencyFieldProps = {
  currencyCode?: string;
  description?: React.ReactNode;
  displayZeroAsEmpty?: boolean;
  label: React.ReactNode;
} & CurrencyFieldInputProps;

export function CurrencyField({
  currencyCode = 'ZAR',
  description,
  displayZeroAsEmpty = false,
  label,
  ...inputProps
}: CurrencyFieldProps) {
  const field = useFieldContext<number>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  const [displayValue, setDisplayValue] = React.useState(() =>
    formatCurrencyFieldValue(field.state.value, displayZeroAsEmpty),
  );

  // Sync display when the field value changes externally (e.g. form reset)
  const previousFieldValue = React.useRef(field.state.value);
  const previousDisplayZeroAsEmpty = React.useRef(displayZeroAsEmpty);
  React.useEffect(() => {
    const valueChanged = hasCurrencyFieldValueChanged(previousFieldValue.current, field.state.value);
    const displayModeChanged = previousDisplayZeroAsEmpty.current !== displayZeroAsEmpty;
    if (!valueChanged && !displayModeChanged) return;

    previousFieldValue.current = field.state.value;
    previousDisplayZeroAsEmpty.current = displayZeroAsEmpty;
    setDisplayValue(formatCurrencyFieldValue(field.state.value, displayZeroAsEmpty));
  }, [displayZeroAsEmpty, field.state.value]);

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
            setDisplayValue(formatCurrencyFieldValue(field.state.value, displayZeroAsEmpty));
          }}
          onChange={(event) => {
            const text = formatCurrencyInputText(event.target.value);
            const nextValue = parseCurrencyFieldValue(text, displayZeroAsEmpty);
            setDisplayValue(text);
            previousFieldValue.current = nextValue;
            field.handleChange(nextValue);
          }}
          type="text"
          value={displayValue}
          {...inputProps}
        />
        <InputGroupAddon align="inline-start">
          <InputGroupText>{CURRENCY_SYMBOL_BY_CODE[currencyCode]}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={fieldErrors} />
    </Field>
  );
}

export function formatCurrencyFieldValue(value: number, displayZeroAsEmpty: boolean): string {
  return displayZeroAsEmpty && value === 0 ? '' : formatCurrency(value);
}

export function hasCurrencyFieldValueChanged(previousValue: number, nextValue: number): boolean {
  return !Object.is(previousValue, nextValue);
}

export function formatCurrencyInputText(text: string): string {
  const normalizedText = normalizeCurrencyInputText(text);
  if (normalizedText === '') return '';
  if (normalizedText === '-') return '-';

  const [integerText = '', decimalText] = normalizedText.split('.');
  const isNegative = integerText.trim().startsWith('-');
  const integerDigits = integerText.replace(/\D/g, '');
  if (integerDigits === '' && decimalText === undefined) return '';

  const formattedInteger = integerDigits === '' ? '0' : formatCurrencyIntegerText(integerDigits);
  const signedInteger = isNegative ? `-${formattedInteger}` : formattedInteger;

  if (decimalText === undefined) return signedInteger;

  return `${signedInteger}.${decimalText.replace(/\D/g, '').slice(0, 2)}`;
}

function parseCurrencyInputText(text: string): number {
  const normalizedText = normalizeCurrencyInputText(text);
  return normalizedText.trim() === '' ? NaN : Number.parseFloat(normalizedText);
}

export function parseCurrencyFieldValue(text: string, displayZeroAsEmpty: boolean): number {
  const value = parseCurrencyInputText(text);
  return displayZeroAsEmpty && Number.isNaN(value) ? 0 : value;
}

function formatCurrencyIntegerText(integerDigits: string): string {
  return formatNumber(Number(integerDigits));
}

function normalizeCurrencyInputText(text: string): string {
  const compactText = text
    .replace(/[\s\u00a0]/g, '')
    .replace(/[^\d.,+-]/g, '')
    .trim();
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
