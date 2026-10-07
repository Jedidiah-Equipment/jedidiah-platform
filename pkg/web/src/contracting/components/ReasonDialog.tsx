import type React from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';

/** A dialog that asks for one required text before a write: the reason, the note, the sentence the action needs. */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  submitLabel,
  schema,
  submit,
  error,
  fallbackMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: string;
  label: string;
  submitLabel: string;
  /** The rule the text must pass, from `@pkg/schema`. */
  schema: z.ZodType<string, string>;
  submit: (text: string) => Promise<unknown>;
  /** The write's refusal, shown under the field when `fallbackMessage` is given. */
  error?: unknown;
  fallbackMessage?: string;
}) {
  return (
    <CreateEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      submitLabel={submitLabel}
      defaultValues={{ reason: '' }}
      validator={z.object({ reason: schema })}
      onCreate={(values) => submit(values.reason)}
      onCreated={() => onOpenChange(false)}
    >
      {(form) => (
        <>
          <form.AppField name="reason">{(field) => <field.TextareaField label={label} />}</form.AppField>
          {fallbackMessage ? <ErrorMessage error={error} fallbackMessage={fallbackMessage} /> : null}
        </>
      )}
    </CreateEntityDialog>
  );
}
