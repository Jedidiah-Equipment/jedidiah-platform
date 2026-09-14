import { IconLoader2 } from '@tabler/icons-react';
import type React from 'react';
import type { z } from 'zod';

import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { useAppForm } from './hooks/use-app-form.js';

type CreateEntityDialogProps<TValues extends Record<string, unknown>, TResult> = {
  /**
   * Blocks submit for state the form schema cannot see — typically a dependency the dialog needs
   * that has not loaded or has failed. `onSubmit` is fire-and-forget, so a throw inside `onCreate`
   * would be silent; this refuses the click instead. Anything the values themselves determine
   * belongs in `validator`, not here.
   */
  canSubmit?: boolean;
  children: (form: CreateEntityFormApi<TValues>) => React.ReactNode;
  contentClassName?: string;
  defaultValues: TValues;
  description?: React.ReactNode;
  onCreated: (result: TResult) => Promise<void> | void;
  onCreate: (values: TValues) => Promise<TResult>;
  onBeforeCreate?: (values: TValues) => boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Static label, or derive it from the live form values (e.g. a kind-dependent verb). */
  submitLabel?: string | ((values: TValues) => string);
  title: React.ReactNode;
  validator: z.ZodType<TValues, TValues>;
};

type CreateEntityFormApi<TValues extends Record<string, unknown>> = ReturnType<
  typeof useAppForm<
    TValues,
    z.ZodType<TValues, TValues>,
    z.ZodType<TValues, TValues>,
    undefined,
    undefined,
    undefined,
    z.ZodType<TValues, TValues>,
    undefined,
    undefined,
    undefined,
    undefined,
    unknown
  >
>;

export function CreateEntityDialog<TValues extends Record<string, unknown>, TResult>({
  canSubmit = true,
  children,
  contentClassName,
  defaultValues,
  description,
  onCreated,
  onCreate,
  onBeforeCreate,
  onOpenChange,
  open,
  submitLabel = 'Save',
  title,
  validator,
}: CreateEntityDialogProps<TValues, TResult>) {
  const form: CreateEntityFormApi<TValues> = useAppForm({
    defaultValues,
    validators: {
      onChange: validator,
      onMount: validator,
      onSubmit: validator,
    },
    onSubmit: async ({ value }) => {
      if (onBeforeCreate && !onBeforeCreate(value as TValues)) return;
      let result: TResult;
      try {
        result = await onCreate(value as TValues);
      } catch {
        // Mutations present their own mapped error in `onError`; keep the fire-and-forget form
        // submission from turning that handled refusal into an unhandled promise rejection.
        return;
      }
      await onCreated(result);
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          {children(form)}
          <form.Subscribe
            selector={(state) => ({
              canSubmit: canSubmit && state.canSubmit,
              isSubmitting: state.isSubmitting,
              label: typeof submitLabel === 'function' ? submitLabel(state.values as TValues) : submitLabel,
            })}
          >
            {({ canSubmit: formCanSubmit, isSubmitting, label }) => (
              <DialogFooter>
                <DialogClose render={<Button disabled={isSubmitting} type="button" variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button disabled={isSubmitting || !formCanSubmit} type="submit">
                  {isSubmitting ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : null}
                  {label}
                </Button>
              </DialogFooter>
            )}
          </form.Subscribe>
        </form>
      </DialogContent>
    </Dialog>
  );
}
