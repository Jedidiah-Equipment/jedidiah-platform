import type { DeepKeysOfType } from "@tanstack/react-form";

import { TextField, type TextFieldProps } from "./TextField.js";

export type PasswordFieldProps<TFormData, TName extends DeepKeysOfType<TFormData, string>> = Omit<
  TextFieldProps<TFormData, TName>,
  "type"
>;

export function PasswordField<TFormData, TName extends DeepKeysOfType<TFormData, string>>({
  autoComplete = "current-password",
  ...props
}: PasswordFieldProps<TFormData, TName>) {
  return <TextField autoComplete={autoComplete} type="password" {...props} />;
}
