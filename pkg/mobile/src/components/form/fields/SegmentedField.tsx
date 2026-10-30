import type { ReactNode } from 'react';

import { SegmentedControl, type SegmentedOption } from '@/components/SegmentedControl';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { FieldShell } from './FieldShell';

export type SegmentedFieldProps = {
  label?: ReactNode;
  onValueCommit?: (value: string) => void;
  options: readonly SegmentedOption<string>[];
};

/** A `SegmentedControl` bound to a form field — the native idiom for web's dropdown `SelectField`. */
export function SegmentedField({ label, onValueCommit, options }: SegmentedFieldProps) {
  const field = useFieldContext<string>();
  const errors = getFieldErrors(field.state.meta.errors);

  return (
    <FieldShell errors={errors} label={label}>
      <SegmentedControl
        onChange={(value) => {
          field.handleChange(value);
          onValueCommit?.(value);
        }}
        options={options}
        value={field.state.value}
      />
    </FieldShell>
  );
}
