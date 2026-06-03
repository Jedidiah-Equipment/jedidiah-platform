import { Loader2Icon } from 'lucide-react';
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
  children: (form: CreateEntityFormApi<TValues>) => React.ReactNode;
  defaultValues: TValues;
  description?: React.ReactNode;
  onCreated: (result: TResult) => Promise<void> | void;
  onCreate: (values: TValues) => Promise<TResult>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  submitLabel?: string;
  title: React.ReactNode;
  validator: z.ZodType<TValues, TValues>;
};

type CreateEntityFormApi<TValues extends Record<string, unknown>> = ReturnType<
  typeof useAppForm<
    TValues,
    undefined,
    undefined,
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
  children,
  defaultValues,
  description,
  onCreated,
  onCreate,
  onOpenChange,
  open,
  submitLabel = 'Save',
  title,
  validator,
}: CreateEntityDialogProps<TValues, TResult>) {
  const form: CreateEntityFormApi<TValues> = useAppForm({
    defaultValues,
    validators: {
      onSubmit: validator,
    },
    onSubmit: async ({ value }) => {
      const result = await onCreate(value as TValues);
      await onCreated(result);
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
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
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <DialogFooter>
                <DialogClose render={<Button disabled={isSubmitting} type="button" variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button disabled={isSubmitting} type="submit">
                  {isSubmitting ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
                  {submitLabel}
                </Button>
              </DialogFooter>
            )}
          </form.Subscribe>
        </form>
      </DialogContent>
    </Dialog>
  );
}
