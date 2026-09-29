import { formatNumber } from '@pkg/domain';
import { UUID } from '@pkg/schema';
import { type Assignment, Quantity } from '@pkg/schema/contracting';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useAppForm } from '@/components/form/index.js';
import { requiredSelection } from '@/components/form/utils/form-schema.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

const MeasureValues = z.object({ measureTypeId: requiredSelection(UUID, 'Choose a Measure Type'), quantity: Quantity });

export function AddMeasureDialog({ stint }: { stint: Assignment }) {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const [open, setOpen] = useState(false);
  const types = useQuery(trpc.contractingJobs.options.measureTypes.queryOptions(undefined, { enabled: open }));
  const set = useMutation(
    trpc.contractingJobs.measures.set.mutationOptions({
      onSuccess: async () => {
        await invalidateJobs();
        setOpen(false);
      },
    }),
  );
  const remove = useMutation(trpc.contractingJobs.measures.remove.mutationOptions({ onSuccess: invalidateJobs }));
  const triggerLabel = stint.measures.length ? 'Edit measures' : 'Add measure';
  const form = useAppForm({
    defaultValues: { measureTypeId: '', quantity: 1 },
    validators: { onSubmit: MeasureValues },
    onSubmit: async ({ value }) => {
      try {
        const input = MeasureValues.parse(value);
        await set.mutateAsync({ assignmentId: stint.id, ...input });
      } catch {
        // The mutation error remains visible so the quantity can be retried.
      }
    },
  });
  return (
    <>
      <Button
        aria-label={triggerLabel}
        onClick={() => {
          form.reset();
          set.reset();
          remove.reset();
          setOpen(true);
        }}
        size="icon-sm"
        title={triggerLabel}
        type="button"
        variant="outline"
      >
        {stint.measures.length ? <IconPencil aria-hidden="true" /> : <IconPlus aria-hidden="true" />}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Measures · {stint.machineCode}</DialogTitle>
          </DialogHeader>
          {stint.measures.length ? (
            <div className="space-y-2 border-b pb-4">
              <p className="font-medium">Existing measures</p>
              {stint.measures.map((measure) => (
                <div className="flex items-center justify-between gap-2" key={measure.id}>
                  <span>
                    {formatNumber(measure.quantity, { decimals: Number.isInteger(measure.quantity) ? 0 : 2 })}{' '}
                    {measure.measureTypeName}
                  </span>
                  <Button
                    aria-label={`Remove ${measure.measureTypeName}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ assignmentId: stint.id, measureTypeId: measure.measureTypeId })}
                    size="icon-xs"
                    title={`Remove ${measure.measureTypeName}`}
                    type="button"
                    variant="ghost"
                  >
                    <IconTrash aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <ErrorMessage error={remove.error} fallbackMessage="Unable to remove Measure." />
            </div>
          ) : null}
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.AppField name="measureTypeId">
              {(field) => (
                <field.SelectField
                  label="Measure Type"
                  options={(types.data ?? []).map((item) => ({
                    value: item.id,
                    label: `${item.name}${stint.measures.some((measure) => measure.measureTypeId === item.id) ? ' (editing)' : ''}`,
                  }))}
                  onValueCommit={(id) =>
                    form.setFieldValue(
                      'quantity',
                      stint.measures.find((measure) => measure.measureTypeId === id)?.quantity ?? 1,
                    )
                  }
                />
              )}
            </form.AppField>
            <form.AppField name="quantity">
              {(field) => <field.NumberField label="Quantity" decimals={2} min={0.01} />}
            </form.AppField>
            <ErrorMessage error={types.error} fallbackMessage="Unable to load Measure Types." />
            <ErrorMessage error={set.error} fallbackMessage="Unable to set Measure." />
            <DialogFooter>
              <DialogClose render={<Button disabled={set.isPending} type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={set.isPending}>
                Save measure
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
