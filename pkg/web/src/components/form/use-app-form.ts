import { createFormHook } from '@tanstack/react-form';
import { CheckboxField } from './CheckboxField.js';
import { CurrencyField } from './CurrencyField.js';
import { DatePickerField } from './DatePickerField.js';
import { fieldContext, formContext } from './form-context.js';
import { NumberField } from './NumberField.js';
import { PasswordField } from './PasswordField.js';
import { SelectField } from './SelectField.js';
import { TextareaField } from './TextareaField.js';
import { TextField } from './TextField.js';

export const { useAppForm, withFieldGroup, withForm } = createFormHook({
  fieldComponents: {
    CheckboxField,
    CurrencyField,
    DatePickerField,
    NumberField,
    PasswordField,
    SelectField,
    TextareaField,
    TextField,
  },
  formComponents: {},
  fieldContext,
  formContext,
});
