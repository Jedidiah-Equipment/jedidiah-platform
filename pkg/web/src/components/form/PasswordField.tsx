import { TextField, type TextFieldProps } from "./TextField.js";

export type PasswordFieldProps = Omit<TextFieldProps, "type">;

export function PasswordField({ autoComplete = "current-password", ...props }: PasswordFieldProps) {
  return <TextField autoComplete={autoComplete} type="password" {...props} />;
}
