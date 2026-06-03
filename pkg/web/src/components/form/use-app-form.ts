import { createFormHook } from '@tanstack/react-form';
import { CheckboxField } from './CheckboxField.js';
import { CreatableComboboxField } from './CreatableComboboxField.js';
import { CurrencyField } from './CurrencyField.js';
import { DatePickerField } from './DatePickerField.js';
import { fieldContext, formContext } from './form-context.js';
import { NumberField } from './NumberField.js';
import { PasswordField } from './PasswordField.js';
import { PhoneNumberField } from './PhoneNumberField.js';
import { SelectField } from './SelectField.js';
import { TextareaField } from './TextareaField.js';
import { TextField } from './TextField.js';
import { ThumbnailField } from './ThumbnailField.js';

export const { useAppForm, useTypedAppFormContext, withFieldGroup, withForm } = createFormHook({
  fieldComponents: {
    CheckboxField,
    CreatableComboboxField,
    CurrencyField,
    DatePickerField,
    NumberField,
    PasswordField,
    PhoneNumberField,
    SelectField,
    TextareaField,
    TextField,
    ThumbnailField,
  },
  formComponents: {},
  fieldContext,
  formContext,
});
