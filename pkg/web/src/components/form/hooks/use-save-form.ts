import { revalidateLogic } from '@tanstack/react-form';
import type React from 'react';
import type { z } from 'zod';
import { useAppForm } from './use-app-form.js';

type UseSaveFormOptions<TValues extends Record<string, unknown>, TInput, TSaved> = {
  defaultValues: TValues;
  /** The form-value schema: a half-typed value is never refused before the first Save, then each change rechecks. */
  schema: z.ZodType<TValues, TValues>;
  save: (input: TInput) => Promise<TSaved>;
  /** The request for validated form values. */
  toInput: (values: TValues) => TInput;
  /** The saved row as the next baseline, so Save disables again; omit when the form closes on save. */
  fromSaved?: (saved: TSaved) => TValues;
};

/**
 * An explicit-save form: validators run on submit, the save's error stays with the caller's mutation so the draft
 * can be corrected and retried, and a save that returns the row resets the form to it. Edit pages autosave; this is
 * the sanctioned exception for thresholds and rates, where a half-typed value must not apply mid-keystroke. Render
 * `<form.SaveButton />` for the submit control and pass `onFormSubmit` to the `<form>`.
 */
export function useSaveForm<TValues extends Record<string, unknown>, TInput, TSaved>({
  defaultValues,
  schema,
  save,
  toInput,
  fromSaved,
}: UseSaveFormOptions<TValues, TInput, TSaved>) {
  const form = useAppForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: schema },
    onSubmit: async ({ value, formApi }) => {
      try {
        const saved = await save(toInput(value));
        if (fromSaved) formApi.reset(fromSaved(saved));
      } catch {
        // The mutation error stays visible beside the form so the draft can be corrected and retried.
      }
    },
  });
  const onFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit();
  };
  return { form, onFormSubmit };
}
