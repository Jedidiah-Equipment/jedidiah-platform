import type { ReactNode } from 'react';
import type { AppTextInputProps } from '@/components/ui/text-input';
import type { VoiceSession } from '@/components/voice/use-voice-session';
import { VoiceTextArea } from '@/components/voice/VoiceTextArea';
import { useFieldContext } from '../hooks/form-context';
import { getFieldErrors } from '../utils/field-errors';
import { FieldShell } from './FieldShell';

type VoiceTextareaFieldProps = {
  /** The field's voice session, built by the form from its store so the form can report what it saved. */
  voice: VoiceSession;
  label?: ReactNode;
  rows?: number;
} & Omit<AppTextInputProps, 'editable' | 'multiline' | 'onBlur' | 'onChangeText' | 'value' | 'maxLength'>;

/**
 * `TextareaField` with the press-and-hold mic: the voice session owns the text, this field its label and errors. Render
 * it inside `form.AppField` rather than from the registry, so forms without voice never import the recorder.
 */
export function VoiceTextareaField({ voice, label, rows = 5, className, ...inputProps }: VoiceTextareaFieldProps) {
  const field = useFieldContext<string>();
  const errors = getFieldErrors(field.state.meta.errors);

  return (
    <FieldShell errors={errors} label={label}>
      <VoiceTextArea
        className={`${errors.length > 0 ? 'border-danger' : 'border-border'} ${className ?? ''}`}
        onBlur={() => field.handleBlur()}
        rows={rows}
        voice={voice}
        {...inputProps}
      />
    </FieldShell>
  );
}
