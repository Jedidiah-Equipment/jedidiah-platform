import type { DeepKeysOfType, ReactFormExtendedApi } from "@tanstack/react-form";
import type * as React from "react";

import { Field, FieldError, FieldLabel } from "@/components/ui/field.js";
import { Input } from "@/components/ui/input.js";
import { getFieldErrors } from "./field-errors.js";

type AnyReactForm<TFormData> = ReactFormExtendedApi<
  TFormData,
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Form exposes validator generics that should pass through from each caller's form instance.
  any,
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Form exposes validator generics that should pass through from each caller's form instance.
  any,
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Form exposes validator generics that should pass through from each caller's form instance.
  any,
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Form exposes validator generics that should pass through from each caller's form instance.
  any,
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Form exposes validator generics that should pass through from each caller's form instance.
  any,
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Form exposes validator generics that should pass through from each caller's form instance.
  any,
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Form exposes validator generics that should pass through from each caller's form instance.
  any,
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Form exposes validator generics that should pass through from each caller's form instance.
  any,
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Form exposes validator generics that should pass through from each caller's form instance.
  any,
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Form exposes validator generics that should pass through from each caller's form instance.
  any,
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Form exposes validator generics that should pass through from each caller's form instance.
  any
>;

type TextFieldInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "aria-invalid" | "form" | "id" | "name" | "onBlur" | "onChange" | "type" | "value"
>;

export type TextFieldProps<TFormData, TName extends DeepKeysOfType<TFormData, string>> = {
  form: AnyReactForm<TFormData>;
  label: React.ReactNode;
  name: TName;
  type?: React.HTMLInputTypeAttribute;
} & TextFieldInputProps;

export function TextField<TFormData, TName extends DeepKeysOfType<TFormData, string>>({
  form,
  label,
  name,
  type = "text",
  ...inputProps
}: TextFieldProps<TFormData, TName>) {
  return (
    <form.Field name={name}>
      {(field) => {
        const fieldErrors = getFieldErrors(field.state.meta.errors);
        const isInvalid = fieldErrors.length > 0;

        return (
          <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
            <Input
              aria-invalid={isInvalid}
              id={field.name}
              name={field.name}
              onBlur={field.handleBlur}
              onChange={(event) =>
                field.handleChange(event.target.value as Parameters<typeof field.handleChange>[0])
              }
              type={type}
              value={field.state.value as React.ComponentProps<typeof Input>["value"]}
              {...inputProps}
            />
            <FieldError errors={fieldErrors} />
          </Field>
        );
      }}
    </form.Field>
  );
}
