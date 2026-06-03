import { createFormHook } from '@tanstack/react-form';
import { CheckboxField } from '../fields/CheckboxField.js';
import { CreatableComboboxField } from '../fields/CreatableComboboxField.js';
import { CurrencyField } from '../fields/CurrencyField.js';
import { DatePickerField } from '../fields/DatePickerField.js';
import { NumberField } from '../fields/NumberField.js';
import { PasswordField } from '../fields/PasswordField.js';
import { PhoneNumberField } from '../fields/PhoneNumberField.js';
import { SelectField } from '../fields/SelectField.js';
import { TextareaField } from '../fields/TextareaField.js';
import { TextField } from '../fields/TextField.js';
import { ThumbnailField } from '../fields/ThumbnailField.js';
import { fieldContext, formContext } from './form-context.js';

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
