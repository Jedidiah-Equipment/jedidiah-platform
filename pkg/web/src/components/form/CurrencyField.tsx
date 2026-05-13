import type * as React from "react";

import { Field, FieldError, FieldLabel } from "@/components/ui/field.js";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.js";
import { getFieldErrors } from "./field-errors.js";
import { useFieldContext } from "./form-context.js";

type CurrencyFieldInputProps = Omit<
  React.ComponentProps<typeof InputGroupInput>,
  "aria-invalid" | "id" | "name" | "onBlur" | "onChange" | "type" | "value"
>;

export type CurrencyFieldProps = {
  currencyCode?: string;
  label: React.ReactNode;
  locale?: string;
} & CurrencyFieldInputProps;

export function CurrencyField({
  currencyCode = "ZAR",
  label,
  locale = "en-ZA",
  min = "0",
  step = "0.01",
  ...inputProps
}: CurrencyFieldProps) {
  const field = useFieldContext<string>();
  const fieldErrors = getFieldErrors(field.state.meta.errors);
  const isInvalid = fieldErrors.length > 0;

  return (
    <Field data-disabled={inputProps.disabled} data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          aria-invalid={isInvalid}
          id={field.name}
          inputMode="decimal"
          min={min}
          name={field.name}
          onBlur={() => {
            field.handleBlur();
            field.handleChange(formatCurrencyInputValue(field.state.value, locale));
          }}
          onChange={(event) => field.handleChange(event.target.value)}
          step={step}
          type="number"
          value={field.state.value}
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

function formatCurrencyInputValue(value: string, locale: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  const amount = Number(trimmedValue);

  if (!Number.isFinite(amount)) {
    return value;
  }

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    useGrouping: false,
  }).format(amount);
}
