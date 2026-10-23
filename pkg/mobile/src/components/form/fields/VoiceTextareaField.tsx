import type { ReactNode } from 'react';
import type { AppTextInputProps } from '@/components/ui/text-input';
import type { VoiceSession } from '@/components/voice/use-voice-session';
import { VoiceTextArea } from '@/components/voice/VoiceTextArea';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { FieldShell } from './FieldShell';

type VoiceTextareaFieldProps = {
  /** The field's voice session, held by the form so it can report what it saved. */
  voice: VoiceSession;
  label?: ReactNode;
  rows?: number;
} & Omit<AppTextInputProps, 'editable' | 'multiline' | 'onBlur' | 'onChangeText' | 'value' | 'maxLength'>;

/**
 * `TextareaField` with the press-and-hold mic, bound to its form field like any other; the voice session only follows
 * the text. Rendered inside `form.AppField` rather than from the registry, so the reanimated voice frame stays out of
 * every other form's import graph.
 */
export function VoiceTextareaField({ voice, label, rows = 5, ...inputProps }: VoiceTextareaFieldProps) {
  const field = useFieldContext<string>();
  const errors = getFieldErrors(field.state.meta.errors);

  return (
    <FieldShell errors={errors} label={label}>
      <VoiceTextArea
        invalid={errors.length > 0}
        onBlur={() => field.handleBlur()}
        onChangeText={field.handleChange}
        rows={rows}
        value={field.state.value}
        voice={voice}
        {...inputProps}
      />
    </FieldShell>
  );
}
