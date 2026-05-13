import { createFormHook } from "@tanstack/react-form";
import { CurrencyField } from "./CurrencyField.js";
import { fieldContext, formContext } from "./form-context.js";
import { PasswordField } from "./PasswordField.js";
import { TextareaField } from "./TextareaField.js";
import { TextField } from "./TextField.js";

export const { useAppForm, withFieldGroup, withForm } = createFormHook({
  fieldComponents: {
    CurrencyField,
    PasswordField,
    TextareaField,
    TextField,
  },
  formComponents: {},
  fieldContext,
  formContext,
});
