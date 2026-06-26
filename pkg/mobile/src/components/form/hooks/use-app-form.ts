import { createFormHook } from '@tanstack/react-form';

import { MultiSelectField } from '../fields/MultiSelectField';
import { SegmentedField } from '../fields/SegmentedField';
import { TextareaField } from '../fields/TextareaField';
import { fieldContext, formContext } from './form-context';

// The mobile form registry, mirroring pkg/web's `useAppForm`. The field set starts
// minimal (what the feedback form needs) and grows as more mobile forms appear.
export const { useAppForm, useTypedAppFormContext, withForm } = createFormHook({
  fieldComponents: {
    MultiSelectField,
    SegmentedField,
    TextareaField,
  },
  formComponents: {},
  fieldContext,
  formContext,
});
