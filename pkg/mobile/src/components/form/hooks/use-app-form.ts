import { createFormHook } from '@tanstack/react-form';

import { CurrencyField } from '../fields/CurrencyField';
import { DateField } from '../fields/DateField';
import { MultiSelectField } from '../fields/MultiSelectField';
import { NumberField } from '../fields/NumberField';
import { SegmentedField } from '../fields/SegmentedField';
import { SelectField } from '../fields/SelectField';
import { TextareaField } from '../fields/TextareaField';
import { TextField } from '../fields/TextField';
import { fieldContext, formContext } from './form-context';

// The mobile form registry, mirroring pkg/web's `useAppForm`. The field set starts
// minimal (what the feedback form needs) and grows as more mobile forms appear.
export const { useAppForm, useTypedAppFormContext, withForm } = createFormHook({
  fieldComponents: {
    CurrencyField,
    DateField,
    MultiSelectField,
    NumberField,
    SelectField,
    SegmentedField,
    TextField,
    TextareaField,
  },
  formComponents: {},
  fieldContext,
  formContext,
});
