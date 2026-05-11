import { createFormHook } from "@tanstack/react-form";
import { fieldContext, formContext } from "./form-context.js";
import { PasswordField } from "./PasswordField.js";
import { TextField } from "./TextField.js";

export const { useAppForm, withFieldGroup, withForm } = createFormHook({
  fieldComponents: {
    PasswordField,
    TextField,
  },
  formComponents: {},
  fieldContext,
  formContext,
});
